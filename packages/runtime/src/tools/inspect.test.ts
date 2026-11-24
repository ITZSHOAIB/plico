import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServerConfig } from "@plico-ai/contracts";
import { loadProject } from "@plico-ai/core";
import { describe, expect, it } from "vitest";
import { inspectTools } from "../index.js";
import { project } from "../testing/mcp-project.js";

describe("inspectTools", () => {
  it("reports declared and configured MCP tools with effective approval policy", async () => {
    const servers: Record<string, McpServerConfig> = {
      tickets: {
        transport: "stdio",
        command: "node",
        args: ["server.mjs"],
        tools: ["get_ticket", "delete_ticket"],
      },
    };
    const { root } = await project(servers);
    await writeFile(
      join(root, "tools", "lookup.tool.ts"),
      `export default { name: "lookup", description: "Look up", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => null };`,
    );
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        schemaVersion: 1,
        name: "MCP test",
        mcpServers: servers,
        approvals: { tools: { mcp_tickets__get_ticket: "none" } },
      })};`,
    );

    const report = await inspectTools(await loadProject(root));

    expect(report.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "lookup",
          source: "tools/lookup.tool.ts",
          approval: { required: true },
        }),
        expect.objectContaining({
          name: "mcp_tickets__get_ticket",
          source: "mcp:tickets/get_ticket",
          approval: { required: false },
          mcp: { serverId: "tickets", toolName: "get_ticket" },
        }),
        expect.objectContaining({
          name: "mcp_tickets__delete_ticket",
          source: "mcp:tickets/delete_ticket",
          approval: { required: true },
          mcp: { serverId: "tickets", toolName: "delete_ticket" },
        }),
      ]),
    );
  });
});
