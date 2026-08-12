import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");

function resolveSafe(targetPath) {
  const resolved = path.resolve(PROJECT_ROOT, targetPath);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error("Path escapes project root");
  }
  return resolved;
}

export async function read_codebase(targetPath) {
  const filePath = resolveSafe(targetPath);
  return fs.readFile(filePath, "utf8");
}

export async function write_file(targetPath, content) {
  const filePath = resolveSafe(targetPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return { ok: true, path: targetPath };
}

export async function list_files(targetPath = ".") {
  const dirPath = resolveSafe(targetPath);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? "dir" : "file",
  }));
}
