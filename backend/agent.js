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

async function runReAct(message, onToken) {
  const messages = [
    { role: "system", content: systemPrompt.trim() },
    { role: "user", content: message },
  ];

  for (let step = 0; step < 6; step += 1) {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "deepseek-coder:1.3b",
      messages,
      temperature: 0.2,
      stream: false,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    let toolCall = null;
    try {
      toolCall = JSON.parse(text);
    } catch {
      for (const chunk of text.split(/\s+/)) {
        if (chunk) await onToken(chunk + " ");
      }
      return;
    }

    if (!toolCall?.tool || !tools[toolCall.tool]) {
      await onToken(`Invalid tool call: ${text}`);
      return;
    }

    const result = await tools[toolCall.tool](toolCall.args || {});
    await onToken(JSON.stringify({
      type: "tool",
      tool: toolCall.tool,
      args: toolCall.args || {},
      result,
    }));
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "tool", content: JSON.stringify(result) });

    if (step === 5) {
      await onToken(JSON.stringify(result));
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
