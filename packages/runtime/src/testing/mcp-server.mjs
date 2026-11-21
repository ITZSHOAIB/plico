import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const fixture = JSON.parse(readFileSync("mcp-fixture.json", "utf8"));
writeFileSync(
  "mcp-process.json",
  JSON.stringify({
    pid: process.pid,
    cwd: process.cwd(),
    env: Object.fromEntries(
      (fixture.inspectEnv ?? []).map((name) => [name, process.env[name] ?? null]),
    ),
  }),
);
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined || fixture.hang) return;
  let result;
  if (request.method === "initialize") {
    result = {
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "fixture", version: "1" },
    };
  } else if (request.method === "tools/list") {
    result = { tools: fixture.tools };
  } else if (request.method === "tools/call") {
    appendFileSync("mcp-calls.jsonl", `${JSON.stringify(request.params)}\n`);
    result = { content: [{ type: "text", text: "Ticket 42" }] };
  }
  const reply = () =>
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        ...(result ? { result } : { error: { code: -32601, message: "Method not found" } }),
      })}\n`,
    );
  if (request.method === "tools/list" && fixture.delayListMs)
    setTimeout(reply, fixture.delayListMs);
  else reply();
});
