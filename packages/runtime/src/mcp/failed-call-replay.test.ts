import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type ModelProvider,
  recoverRuns,
  runProject,
} from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("does not retry a failed MCP call when a later approval wait resumes", async () => {
  const server = await mcpHttp([[ticket]], 0, {
    callError: { code: -32603, message: "remote failure" },
  });
  try {
    const { root, loaded } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        ...loaded.config,
        approvals: { tools: { mcp_desk__get_ticket: "none" } },
      })};`,
    );
    await writeFile(
      join(root, "tools", "gated.tool.ts"),
      `export default {
      name: "gated", description: "Gated", inputSchema: { type: "object" },
      capabilities: [], approval: { required: true }, handler: async () => "approved"
    };`,
    );
    const provider: ModelProvider = {
      async *stream(request) {
        const count = request.messages.filter((message) => message.role === "tool").length;
        if (count === 0)
          yield {
            type: "tool.call",
            call: { id: "remote", name: "mcp_desk__get_ticket", arguments: { id: "42" } },
          };
        else if (count === 1)
          yield { type: "tool.call", call: { id: "local", name: "gated", arguments: {} } };
        else yield { type: "text", text: "Done" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const waiting = await runProject(root, {
      runId: "failed-call",
      engine: createSqliteEngine({ databasePath }),
      eventStore: store,
      message: "Try the remote tool, then ask",
      provider,
    });
    expect(waiting.status).toBe("waiting");
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
    const request = (await store.getEvents("failed-call")).find(
      (event) => event.type === "approval.requested",
    );
    if (request?.type !== "approval.requested") throw new Error("No approval request");
    const engine = createSqliteEngine({ databasePath });
    await engine.signal("failed-call", `approval:${request.payload.requestId}`, { approved: true });
    expect(await recoverRuns({ engine, eventStore: store, provider })).toEqual([
      { runId: "failed-call", state: "completed" },
    ]);
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
});
