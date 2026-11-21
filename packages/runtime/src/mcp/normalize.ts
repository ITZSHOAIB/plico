import type { Tool } from "@modelcontextprotocol/client";
import type { JsonSchema, McpTool } from "@plico-ai/contracts";

export function mcpToolName(serverId: string, toolName: string): string {
  const name = `mcp_${serverId}__${toolName.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  if (name.length > 64)
    throw new Error(
      `MCP server ${serverId}: tool ${toolName} normalizes to a name longer than 64 characters. Use a shorter server ID.`,
    );
  return name;
}

export function toMcpTool(serverId: string, tool: Tool): McpTool {
  const name = mcpToolName(serverId, tool.name);
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
