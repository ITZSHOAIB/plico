import type { LoadedProject, McpTool } from "@plico-ai/contracts";
import { toMcpTool } from "./normalize.js";
import { withMcpClient } from "./session.js";

export interface McpDiscoveryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Returns allowlisted metadata and closes every connection before returning. */
export async function discoverMcpTools(
  project: LoadedProject,
  options: McpDiscoveryOptions = {},
): Promise<McpTool[]> {
  if (options.signal?.aborted) throw new Error("MCP discovery cancelled.");
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
    throw new Error("MCP discovery timeoutMs must be a positive 32-bit integer.");
  const sources = Object.entries(project.config.mcpServers ?? {});
  if (sources.length === 0) return [];
  const tools: McpTool[] = [];
  for (const [serverId, source] of sources) {
    if (options.signal?.aborted) throw new Error("MCP discovery cancelled.");
    const advertised = await withMcpClient(
      {
        root: project.root,
        serverId,
        source,
        operation: "discovery",
        timeoutMs,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      (client, request) => client.listTools(undefined, request),
    );
    for (const name of source.tools) {
      const matches = advertised.tools.filter((tool) => tool.name === name);
      if (matches.length > 1)
        throw new Error(`MCP server ${serverId}: ${name} is advertised more than once.`);
      const tool = matches[0];
      if (!tool) throw new Error(`MCP server ${serverId}: ${name} is not advertised.`);
      const normalized = toMcpTool(serverId, tool);
      const first = tools.find((tool) => tool.name === normalized.name);
      if (first)
        throw new Error(
          `Duplicate MCP tool name ${normalized.name} declared in ${first.source} and ${normalized.source}. Rename the source or narrow its allowlist.`,
        );
      tools.push(normalized);
    }
  }
  return tools;
}
