import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import OpenAI from "openai";
import { read_codebase, write_file, list_files } from "./tools.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const server = app.listen(process.env.PORT || 3001, () => {
  console.log(`Backend listening on http://localhost:${server.address().port}`);
});

const wss = new WebSocketServer({ server, path: "/ws" });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "ollama",
  baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1",
});

const tools = {
  read_codebase,
  write_file,
  list_files,
};

const systemPrompt = `
You are an autonomous coding agent.
Respond with either:
1) plain assistant text, or
2) a single JSON object with shape:
   {"tool":"read_codebase","args":{"targetPath":"backend/agent.js"}}
   {"tool":"write_file","args":{"targetPath":"frontend/app.js","content":"..."}}
   {"tool":"list_files","args":{"targetPath":"."}}
Keep JSON strictly valid when using tools.
`;

function extractJson(rawText) {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(rawText.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractCodeBlock(rawText) {
  const match = rawText.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```/);
  return match?.[1]?.trim() || null;
}

function inferTargetPath(message) {
  const patterns = [
    /(?:named|called)\s+([A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/i,
    /(?:file|script)\s+([A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/i,
    /([A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "auto-generated.js";
}

async function executeToolCall(toolCall, onToken, messages) {
  if (!toolCall?.tool || !tools[toolCall.tool]) {
    return false;
  }

  const args = toolCall.args || {};
  const isFallback = toolCall.fallback === true;
  const result = await tools[toolCall.tool](args);

  await onToken(
    JSON.stringify({
      type: "tool",
      tool: toolCall.tool,
      args,
      result,
      fallback: isFallback,
    }),
  );

  messages.push({ role: "assistant", content: JSON.stringify(toolCall) });
  messages.push({ role: "tool", content: JSON.stringify(result) });
  return true;
}

async function runReAct(message, onToken) {
  const messages = [
    { role: "system", content: systemPrompt.trim() },
    { role: "user", content: message },
  ];
  const inferredTargetPath = inferTargetPath(message);

  for (let step = 0; step < 6; step += 1) {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "deepseek-coder:1.3b",
      messages,
      temperature: 0.2,
      stream: false,
    });

    const rawText = response.choices[0]?.message?.content?.trim() || "";
    let toolCall = extractJson(rawText);

    if (!toolCall || !toolCall.args || Object.keys(toolCall.args).length === 0) {
      const codeBlock = extractCodeBlock(rawText);
      if (codeBlock) {
        toolCall = {
          tool: "write_file",
          args: {
            targetPath: inferredTargetPath,
            content: codeBlock,
          },
          fallback: true,
        };
      }
    }

    if (!toolCall) {
      for (const chunk of rawText.split(/\s+/)) {
        if (chunk) await onToken(chunk + " ");
      }
      return;
    }

    const executed = await executeToolCall(toolCall, onToken, messages);
    if (!executed) {
      await onToken(`Invalid tool call: ${rawText}`);
      return;
    }

    if (step === 5) {
      await onToken(
        JSON.stringify({
          type: "tool",
          tool: toolCall.tool,
          args: toolCall.args || {},
          fallback: true,
        }),
      );
      return;
    }
  }
}

wss.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    const payload = JSON.parse(raw.toString());
    await runReAct(payload.message || "Hello", (token) => {
      socket.send(JSON.stringify({ type: "token", token }));
    });
    socket.send(JSON.stringify({ type: "done" }));
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  const chunks = [];
  await runReAct(req.body?.message || "Hello", async (token) => {
    chunks.push(token);
  });
  res.json({ output: chunks.join("") });
});
