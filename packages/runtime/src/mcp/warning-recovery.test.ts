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

it("replays a skipped-source warning once when a healthy MCP approval resumes", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root } = await project({
      unavailable: { transport: "stdio", command: "plico-missing-command", tools: ["read"] },
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const databasePath = join(root, "state.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    const provider: ModelProvider = {
      async *stream(request) {
        if (request.messages.some((message) => message.role === "tool"))
          yield { type: "text", text: "Done" };
        else
          yield {
            type: "tool.call",
            call: { id: "ticket", name: "mcp_desk__get_ticket", arguments: { id: "42" } },
          };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const waiting = await runProject(root, {
      runId: "warning",
      message: "Find",
      provider,
      eventStore,
      engine: createSqliteEngine({ databasePath }),
    });
    expect(waiting.status).toBe("waiting");
    const request = waiting.events.find((event) => event.type === "approval.requested");
    if (request?.type !== "approval.requested") throw new Error("No approval request");
    const engine = createSqliteEngine({ databasePath });
    await engine.signal("warning", `approval:${request.payload.requestId}`, { approved: true });
    expect(await recoverRuns({ engine, eventStore, provider })).toEqual([
      { runId: "warning", state: "completed" },
    ]);
    expect(
      (await eventStore.getEvents("warning")).filter((event) => event.type === "run.warning"),
    ).toHaveLength(1);
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
});
