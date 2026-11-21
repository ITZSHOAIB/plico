import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonSchema, LoadedProject, McpServerConfig } from "@plico-ai/contracts";
import { loadProject } from "@plico-ai/core";

export const serverFile: string = fileURLToPath(new URL("./mcp-server.mjs", import.meta.url));
export const schema: JsonSchema = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
};
export const ticket: { name: string; description: string; inputSchema: JsonSchema } = {
  name: "get_ticket",
  description: "Read a ticket.",
  inputSchema: schema,
};
export async function project(
  servers: Record<string, McpServerConfig>,
): Promise<{ root: string; loaded: LoadedProject }> {
  const root = await mkdtemp(join(tmpdir(), "plico-mcp-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(join(root, "agent.md"), "# MCP test");
  await writeFile(
    join(root, "plico.config.ts"),
    `export default ${JSON.stringify({
      schemaVersion: 1,
      name: "MCP test",
      mcpServers: servers,
    })};`,
  );
  return { root, loaded: await loadProject(root) };
}
