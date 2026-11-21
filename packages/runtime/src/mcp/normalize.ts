import type { Tool } from "@modelcontextprotocol/client";
import type { JsonSchema, McpTool } from "@plico-ai/contracts";

export function toMcpTool(serverId: string, tool: Tool): McpTool {
  const name = `mcp_${serverId}__${tool.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  if (name.length > 64)
    throw new Error(
      `MCP server ${serverId}: tool ${tool.name} normalizes to a name longer than 64 characters. Use a shorter server ID.`,
    );
  return {
    serverId,
    toolName: tool.name,
    source: `mcp:${serverId}/${tool.name}`,
    name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema as JsonSchema,
    capabilities: [],
    approval: { required: true },
  };
}
