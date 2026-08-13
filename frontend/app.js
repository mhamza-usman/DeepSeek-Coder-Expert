const output = document.getElementById("output");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");

let editor;
let editorModel;

function setStatus(text, tone = "idle") {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function scrollChatToBottom() {
  output.scrollTop = output.scrollHeight;
}

function appendOutput(text) {
  output.textContent += text;
  scrollChatToBottom();
}

function appendUserMessage(text) {
  if (output.textContent) {
    appendOutput("\n\n");
  }
  appendOutput(`You: ${text}\nAssistant: `);
}

function replaceEditorContent(text) {
  if (editorModel) {
    editorModel.setValue(text);
  }
}

function buildWrappedMessage(userMessage) {
  return [
    `User Request: ${userMessage}`,
    "",
    "CRITICAL INSTRUCTION: You MUST use the appropriate tool (write_file, read_codebase, list_files) to fulfill this request. DO NOT output conversational text. Output ONLY a valid, raw JSON object.",
  ].join("\n");
}

require.config({ paths: { vs: "https://unpkg.com/monaco-editor@0.52.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  editorModel = monaco.editor.createModel(
    "// Ask the agent to write or inspect files.\n",
    "javascript",
  );

  editor = monaco.editor.create(document.getElementById("editor"), {
    model: editorModel,
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
  });
});

function connectAndSend(userMessage) {
  const wrappedMessage = buildWrappedMessage(userMessage);
  const ws = new WebSocket("ws://localhost:3001/ws");

  output.textContent = "";
  appendUserMessage(userMessage);
  setStatus("Connecting...", "pending");
  sendBtn.disabled = true;

  ws.onopen = () => {
    setStatus("Connected", "live");
    ws.send(JSON.stringify({ message: wrappedMessage }));
  };

  ws.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      appendOutput(String(event.data));
      return;
    }

    if (payload.type === "token") {
      appendOutput(payload.token);
      return;
    }

    if (payload.type === "tool") {
      appendOutput(`\n[tool:${payload.tool}] ${JSON.stringify(payload.result)}\n`);

      if (payload.tool === "write_file") {
        const content =
          payload.result?.content ??
          payload.args?.content ??
          payload.result?.message ??
          "";

        if (content) {
          replaceEditorContent(content);
        }
      }

      return;
    }

    if (payload.type === "done") {
      setStatus("Done", "idle");
      sendBtn.disabled = false;
      ws.close();
    }
  };

  ws.onerror = () => {
    setStatus("Connection error", "error");
    appendOutput("\n[error] WebSocket connection failed.\n");
    sendBtn.disabled = false;
  };

  ws.onclose = () => {
    if (statusEl.textContent !== "Done") {
      setStatus("Disconnected", "idle");
    }
    sendBtn.disabled = false;
  };
}

sendBtn.addEventListener("click", () => {
  const userMessage =
    promptEl.value || "Inspect the codebase and summarize the key files.";
  connectAndSend(userMessage);
});

promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    const userMessage =
      promptEl.value || "Inspect the codebase and summarize the key files.";
    connectAndSend(userMessage);
  }
});
