import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createEngine,
  createMemoryJournal,
  createSqliteEngine,
  createSqliteEventStore,
  recoverRuns,
  runProject,
} from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Fixture call was not reached.");
}

it("cancels a run during MCP discovery and closes its session", async () => {
  const server = await mcpHttp([[ticket]], 1000);
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const engine = createEngine({ journal: createMemoryJournal() });
    const running = runProject(root, {
      engine,
      runId: "cancel-discovery",
      script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
    });
    await until(() => server.requests.some((request) => request.method === "tools/list"));
    await engine.cancel("cancel-discovery");
    expect(await running).toMatchObject({ status: "cancelled" });
    expect(server.requests.some((request) => request.method === "DELETE")).toBe(true);
    expect(server.requests.some((request) => request.method === "tools/call")).toBe(false);
  } finally {
    await server.close();
  }
});

it("aborts an in-flight MCP call and closes the session on cancellation", async () => {
  const server = await mcpHttp([[ticket]], 0, { hangCall: true });
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const engine = createEngine({ journal: createMemoryJournal() });
    const running = runProject(root, {
      engine,
      runId: "cancel-call",
      script: [
        { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
        { type: "approval.decide", approved: true },
      ],
    });
    await until(() => server.requests.some((request) => request.method === "tools/call"));
    await engine.cancel("cancel-call");
    expect(await running).toMatchObject({ status: "cancelled" });
    expect(server.requests.filter((request) => request.method === "DELETE")).toHaveLength(2);
  } finally {
    await server.close();
  }
});

it("rejects remote schema changes between discovery and approved execution", async () => {
  const tools = [{ ...ticket }];
  const server = await mcpHttp([tools]);
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    await runProject(root, {
      runId: "schema-change",
      engine: createSqliteEngine({ databasePath }),
      eventStore: store,
      script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
    });
    tools[0] = { ...ticket, inputSchema: { type: "object", required: ["secret"] } };
    const engine = createSqliteEngine({ databasePath });
    await engine.signal("schema-change", "approval:schema-change:0", { approved: true });
    expect((await recoverRuns({ engine, eventStore: store }))[0]?.state).toBe("failed");
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(0);
    expect(JSON.stringify(await store.getEvents("schema-change"))).toContain(
      "changed since discovery",
    );
  } finally {
    await server.close();
  }
});

it("rejects changed MCP approval policy before resuming a waiting call", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root, loaded } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const waiting = await runProject(root, {
      runId: "policy-change",
      engine: createSqliteEngine({ databasePath }),
      eventStore: store,
      script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
    });
    expect(waiting.status).toBe("waiting");
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        ...loaded.config,
        approvals: { tools: { mcp_desk__get_ticket: "none" } },
      })};`,
    );
    const engine = createSqliteEngine({ databasePath });
    await engine.signal("policy-change", "approval:policy-change:0", { approved: true });
    const recovered = await recoverRuns({ engine, eventStore: store });
    expect(recovered[0]?.state).toBe("failed");
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(0);
  } finally {
    await server.close();
  }
});
