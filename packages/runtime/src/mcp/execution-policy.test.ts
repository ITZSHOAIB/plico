import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { type DryRunScriptStep, runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it.each([
  {
    label: "invalid arguments",
    arguments: { id: 42 },
    decision: true,
    status: "failed",
    phase: "tool.validation",
  },
  {
    label: "denied approval",
    arguments: { id: "42" },
    decision: false,
    status: "failed",
    phase: "approval",
  },
  { label: "server hints and a global none policy", arguments: { id: "42" }, status: "waiting" },
])("does not call MCP with $label", async ({ arguments: input, decision, status, phase }) => {
  const server = await mcpHttp([
    [{ ...ticket, annotations: { readOnlyHint: true, destructiveHint: false } }],
  ]);
  try {
    const { root, loaded } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        ...loaded.config,
        approvals: { default: "none" },
      })};`,
    );
    const script: DryRunScriptStep[] = [
      { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: input },
    ];
    if (decision !== undefined) script.push({ type: "approval.decide", approved: decision });
    const result = await runProject(root, { script });
    expect(result.status).toBe(status);
    if (phase)
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: "run.error",
          payload: expect.objectContaining({ phase }),
        }),
      );
    expect(server.requests.some((request) => request.method === "tools/call")).toBe(false);
  } finally {
    await server.close();
  }
});

it("permits TypeScript tools with the mcp_ prefix when no name collides", async () => {
  const { root } = await project({});
  await writeFile(
    join(root, "tools", "local.tool.ts"),
    `export default {
    name: "mcp_custom", description: "Local", inputSchema: { type: "object" },
    capabilities: [], approval: { required: true }, handler: async () => "local"
  };`,
  );
  await writeFile(
    join(root, "plico.config.ts"),
    `export default {
    schemaVersion: 1, name: "Local", approvals: { tools: { mcp_custom: "none" } }
  };`,
  );
  const result = await runProject(root, {
    script: [{ type: "tool.call", toolName: "mcp_custom", arguments: {} }],
  });
  // Its TypeScript-declared gate still cannot be waived, even with an mcp_ name.
  expect(result.status).toBe("waiting");
  expect(result.events).toContainEqual(expect.objectContaining({ type: "approval.requested" }));
});

it("does not connect to MCP for a TypeScript tool sharing a server's prefix", async () => {
  const { root } = await project({
    desk: { transport: "stdio", command: "plico-missing-command", tools: ["get_ticket"] },
  });
  await writeFile(
    join(root, "tools", "local.tool.ts"),
    `export default {
    name: "mcp_desk__custom", description: "Local", inputSchema: { type: "object" },
    capabilities: [], approval: { required: false }, handler: async () => "local"
  };`,
  );
  expect(
    await runProject(root, {
      script: [{ type: "tool.call", toolName: "mcp_desk__custom", arguments: {} }],
    }),
  ).toMatchObject({ status: "completed" });
});
