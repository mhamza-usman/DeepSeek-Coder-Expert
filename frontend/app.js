const output = document.getElementById("output");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");

let editor;
require.config({ paths: { vs: "https://unpkg.com/monaco-editor@0.52.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "// Your code appears here\n",
    language: "javascript",
    theme: "vs-dark",
    automaticLayout: true,
  });
});

function connectAndSend(message) {
  const ws = new WebSocket("ws://localhost:3001/ws");
  output.textContent = "";
  ws.onopen = () => ws.send(JSON.stringify({ message }));
  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "token") {
      output.textContent += payload.token;
    }
    if (payload.type === "done") {
      ws.close();
    }
  };
  ws.onerror = () => {
    output.textContent = "WebSocket connection failed.";
  };
}

sendBtn.addEventListener("click", () => {
  connectAndSend(promptEl.value || "Inspect the codebase and summarize the key files.");
});
