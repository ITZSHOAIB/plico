import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "plico-built-server-"));
const cliPath = join(root, "packages", "cli", "dist", "cli.js");
const server = spawn(
  process.execPath,
  [
    cliPath,
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    "0",
    "--db",
    join(temporaryDirectory, "server.sqlite"),
    join(root, "examples", "internal-ops-agent"),
  ],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
);

try {
  const baseUrl = await waitForServer(server);
  const response = execFileSync(
    process.platform === "win32" ? "curl.exe" : "curl",
    ["--fail", "--silent", "--show-error", `${baseUrl}/health`],
    { encoding: "utf8" },
  );
  if (JSON.stringify(JSON.parse(response)) !== JSON.stringify({ ok: true })) {
    throw new Error(`Unexpected health response: ${response}`);
  }
  console.log("Built plico serve /health check passed.");
} finally {
  if (server.exitCode === null) {
    const exited = new Promise((resolveExit) => {
      if (server.exitCode !== null) resolveExit();
      else server.once("exit", resolveExit);
    });
    server.kill();
    await exited;
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function waitForServer(child) {
  return new Promise((resolveUrl, reject) => {
    let output = "";
    const timer = setTimeout(() => finish(new Error("Timed out waiting for plico serve.")), 15000);
    function finish(error, url) {
      clearTimeout(timer);
      if (error) reject(error);
      else resolveUrl(url);
    }
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/Serving Plico at (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) finish(undefined, match[1]);
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) =>
      finish(new Error(`plico serve exited before listening (${code}). ${output}`)),
    );
  });
}
