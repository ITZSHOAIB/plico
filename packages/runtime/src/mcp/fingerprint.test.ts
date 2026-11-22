import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createSqliteEngine, createSqliteEventStore, recoverRuns, runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("resumes when MCP source and approval keys are reordered without changing their values", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root, loaded } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const config = {
      ...loaded.config,
      approvals: { timeoutMs: 60_000, tools: { mcp_desk__get_ticket: "required", unused: "none" } },
    };
    const configFile = join(root, "plico.config.ts");
    await writeFile(configFile, `export default ${JSON.stringify(config)};`);
    const databasePath = join(root, "state.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    expect(
      await runProject(root, {
        runId: "ordered",
        eventStore,
        engine: createSqliteEngine({ databasePath }),
        script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
      }),
    ).toMatchObject({ status: "waiting" });
    await writeFile(
      configFile,
      `export default ${JSON.stringify({
        ...loaded.config,
        mcpServers: {
          desk: { tools: ["get_ticket"], url: server.url, transport: "streamable-http" },
        },
        approvals: {
          tools: { unused: "none", mcp_desk__get_ticket: "required" },
          timeoutMs: 60_000,
        },
      })};`,
    );
    const engine = createSqliteEngine({ databasePath });
    await engine.signal("ordered", "approval:ordered:0", { approved: true });
    expect(await recoverRuns({ engine, eventStore })).toEqual([
      { runId: "ordered", state: "completed" },
    ]);
  } finally {
    await server.close();
  }
});

it("detects approval policy changes on recovery even without MCP sources", async () => {
  const { root } = await project({});
  const configFile = join(root, "plico.config.ts");
  await writeFile(
    configFile,
    `export default { schemaVersion: 1, name: "Policy", approvals: { timeoutMs: 60000 } };`,
  );
  await writeFile(
    join(root, "tools", "gated.tool.ts"),
    `export default { name: "gated", description: "Gate", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: async () => "done" };`,
  );
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  expect(
    await runProject(root, {
      runId: "local-policy",
      eventStore,
      engine: createSqliteEngine({ databasePath }),
      script: [{ type: "tool.call", toolName: "gated", arguments: {} }],
    }),
  ).toMatchObject({ status: "waiting" });
  await writeFile(
    configFile,
    `export default { schemaVersion: 1, name: "Policy", approvals: { timeoutMs: 120000 } };`,
  );
  const engine = createSqliteEngine({ databasePath });
  await engine.signal("local-policy", "approval:local-policy:0", { approved: true });
  expect(await recoverRuns({ engine, eventStore })).toEqual([
    { runId: "local-policy", state: "failed" },
  ]);
});
