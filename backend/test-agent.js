import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_FILE = path.resolve(ROOT, "workspace-test.js");
const TIMEOUT_MS = 15_000;

function cleanupTimer(timer) {
  if (timer) clearTimeout(timer);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let finished = false;
  let timer;

  const ws = new WebSocket("ws://localhost:3001/ws");

  const finish = async (code, message) => {
    if (finished) return;
    finished = true;
    cleanupTimer(timer);
    try {
      ws.close();
    } catch {}
    console.log(message);
    process.exit(code);
  };

  timer = setTimeout(() => {
    finish(1, "[TEST FAILED] Timed out waiting for tool execution.");
  }, TIMEOUT_MS);

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        message:
          "Create a file named workspace-test.js that exports a simple add function.",
      }),
    );
  });

  ws.on("message", async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      process.stdout.write(raw.toString());
      return;
    }

    if (payload.type === "token") {
      process.stdout.write(payload.token);
      return;
    }

    if (payload.type === "tool") {
      console.log(`\n[tool:${payload.tool}] ${JSON.stringify(payload.result)}`);

      if (payload.tool === "write_file" && payload.result?.path) {
        const createdPath = path.resolve(ROOT, payload.result.path);
        if (createdPath === TARGET_FILE && (await fileExists(createdPath))) {
          await finish(0, "[TEST PASSED] workspace-test.js was created successfully.");
          return;
        }
      }
      return;
    }

    if (payload.type === "done") {
      if (await fileExists(TARGET_FILE)) {
        await finish(0, "[TEST PASSED] workspace-test.js was created successfully.");
      } else {
        await finish(1, "[TEST FAILED] File was not created on disk.");
      }
    }
  });

  ws.on("error", async (err) => {
    await finish(1, `[TEST FAILED] WebSocket error: ${err.message}`);
  });
}

main().catch((err) => {
  console.error(`[TEST FAILED] ${err.message}`);
  process.exit(1);
});
