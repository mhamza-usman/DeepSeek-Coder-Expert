import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from openai import OpenAI

load_dotenv()

app = FastAPI()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY", "ollama"),
    base_url=os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1"),
)


def read_codebase(args):
    return {"status": "success", "content": f"Read {args.get('targetPath')}"}


def write_file(args):
    return {"status": "success", "message": f"Wrote to {args.get('targetPath')}"}


def list_files(args):
    return {"status": "success", "files": ["index.html", "app.js"]}


tools_map = {
    "read_codebase": read_codebase,
    "write_file": write_file,
    "list_files": list_files,
}

system_prompt = """
You are an autonomous coding agent.
Respond with either:
1) plain assistant text, or
2) a single JSON object with shape:
   {"tool":"read_codebase","args":{"targetPath":"backend/agent.py"}}
   {"tool":"write_file","args":{"targetPath":"frontend/app.js","content":"..."}}
   {"tool":"list_files","args":{"targetPath":"."}}
Keep JSON strictly valid when using tools.
"""


async def run_react(message: str, websocket: WebSocket):
    messages = [
        {"role": "system", "content": system_prompt.strip()},
        {"role": "user", "content": message},
    ]

    for step in range(6):
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "deepseek-coder:1.3b"),
            messages=messages,
            temperature=0.2,
            stream=False,
        )

        text = response.choices[0].message.content.strip()

        try:
            tool_call = json.loads(text)
        except json.JSONDecodeError:
            await websocket.send_json({"type": "token", "token": text})
            return

        if not tool_call.get("tool") or tool_call["tool"] not in tools_map:
            await websocket.send_json(
                {"type": "token", "token": f"Invalid tool call: {text}"}
            )
            return

        result = tools_map[tool_call["tool"]](tool_call.get("args", {}))
        messages.append({"role": "assistant", "content": text})
        messages.append({"role": "tool", "content": json.dumps(result)})

        if step == 5:
            await websocket.send_json({"type": "token", "token": json.dumps(result)})
            return


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            await run_react(payload.get("message", "Hello"), websocket)
            await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        print("Client disconnected")


@app.get("/health")
def health_check():
    return {"ok": True}

