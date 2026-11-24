import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createPlico } from "./index.js";

async function project(config: Record<string, unknown> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-tools-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default ${JSON.stringify({ schemaVersion: 1, name: "Tools", ...config })};`,
  );
  await writeFile(join(root, "agent.md"), "Triage.");
  return root;
}

it("serves declared and configured MCP tools without connecting to servers", async () => {
  const root = await project({
    mcpServers: {
      local: {
        transport: "stdio",
        command: "missing-mcp-server",
        tools: ["lookup"],
      },
    },
    approvals: { tools: { mcp_local__lookup: "none" } },
  });
  await writeFile(
    join(root, "tools", "create-ticket.tool.ts"),
    `export default { name: "create_ticket", description: "Create", inputSchema: { type: "object" }, capabilities: ["side-effect"], approval: { required: true }, handler: () => null };`,
  );
  const plico = await createPlico({ projectRoot: root, databasePath: join(root, "state.sqlite") });
  try {
    const response = await plico.fetch()(new Request("https://app.example/v1/tools"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      tools: Array<{
        name: string;
        source: string;
        approval: { required: boolean };
        mcp?: unknown;
      }>;
    };
    expect(body.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "create_ticket",
          source: "tools/create-ticket.tool.ts",
          approval: { required: true },
        }),
        expect.objectContaining({
          name: "mcp_local__lookup",
          source: "mcp:local/lookup",
          approval: { required: false },
          mcp: { serverId: "local", toolName: "lookup" },
        }),
      ]),
    );
  } finally {
    await plico.close();
  }
});
