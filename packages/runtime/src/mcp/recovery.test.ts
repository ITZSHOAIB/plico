import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createSqliteEngine, createSqliteEventStore, recoverRuns } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

const execFileAsync = promisify(execFile);

async function crashRun(root: string, databasePath: string): Promise<void> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `
    import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
    const [root, databasePath] = process.argv.slice(1);
    await runProject(root, { runId: "mcp-crash", engine: createSqliteEngine({ databasePath }),
      eventStore: createSqliteEventStore({ databasePath }), script: [
        { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
        { type: "approval.decide", approved: true },
        { type: "tool.call", toolName: "crash", arguments: {} },
      ] });`;
  await expect(
    execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      program,
      root,
      databasePath,
    ]),
  ).rejects.toThrow();
}

it("replays a journaled MCP result without reconnecting to the server", {
  timeout: 30_000,
}, async () => {
  const server = await mcpHttp([[ticket]]);
  const { root } = await project({
    desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
  });
  await writeFile(
    join(root, "tools", "crash.tool.ts"),
    `
    import { existsSync, writeFileSync } from "node:fs";
    export default { name: "crash", description: "Crash once", inputSchema: { type: "object" },
      capabilities: [], approval: { required: false }, handler: async () => {
        const marker = ${JSON.stringify(join(root, "crashed"))};
        if (!existsSync(marker)) { writeFileSync(marker, "yes"); process.kill(process.pid, "SIGKILL"); }
        return "recovered";
      } };`,
  );
  const databasePath = join(root, "state.sqlite");
  try {
    await crashRun(root, databasePath);
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
  const store = createSqliteEventStore({ databasePath });
  expect(
    await recoverRuns({ engine: createSqliteEngine({ databasePath }), eventStore: store }),
  ).toEqual([{ runId: "mcp-crash", state: "completed" }]);
  expect(
    (await store.getEvents("mcp-crash")).filter((event) => event.type === "tool.result"),
  ).toHaveLength(2);
});

it("repeats a remote side effect after a crash before its result is journaled", {
  timeout: 30_000,
}, async () => {
  const fault = { hangCall: true };
  const server = await mcpHttp([[ticket]], 0, fault);
  const { root } = await project({
    desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
  });
  const databasePath = join(root, "state.sqlite");
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `
    import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
    const [root, databasePath] = process.argv.slice(1);
    await runProject(root, { runId: "pending", engine: createSqliteEngine({ databasePath }),
      eventStore: createSqliteEventStore({ databasePath }), script: [
        { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
        { type: "approval.decide", approved: true },
      ] });`;
  const child = execFile(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    program,
    root,
    databasePath,
  ]);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  try {
    for (let attempt = 0; attempt < 1000; attempt++) {
      if (server.requests.some((request) => request.method === "tools/call")) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
    child.kill("SIGKILL");
    await exited;
    fault.hangCall = false;
    const store = createSqliteEventStore({ databasePath });
    expect(
      await recoverRuns({ engine: createSqliteEngine({ databasePath }), eventStore: store }),
    ).toEqual([{ runId: "pending", state: "completed" }]);
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(2);
    expect(
      (await store.getEvents("pending")).filter((event) => event.type === "tool.result"),
    ).toHaveLength(1);
  } finally {
    child.kill("SIGKILL");
    await exited;
    await server.close();
  }
});
