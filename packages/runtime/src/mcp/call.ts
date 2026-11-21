import { isDeepStrictEqual } from "node:util";
import type { LoadedProject, McpTool } from "@plico-ai/contracts";
import { toMcpTool } from "./normalize.js";
import { McpSessionError, withMcpClient } from "./session.js";

export async function callMcpTool(
  project: LoadedProject,
  tool: McpTool,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const source = project.config.mcpServers?.[tool.serverId];
  if (!source) throw new Error(`MCP server ${tool.serverId}: source is not configured.`);
  return withMcpClient(
    {
      root: project.root,
      serverId: tool.serverId,
      source,
      operation: `tool ${tool.toolName}`,
      signal,
      timeoutMs: 30_000,
    },
    async (client, request) => {
      const listed = await client.listTools(undefined, request);
      const matches = listed.tools.filter((entry) => entry.name === tool.toolName);
      const definition = matches[0];
      if (
        matches.length !== 1 ||
        !definition ||
        !isDeepStrictEqual(toMcpTool(tool.serverId, definition), tool)
      )
        throw new McpSessionError(
          `MCP server ${tool.serverId}: tool ${tool.toolName} changed since discovery.`,
        );
      const result = await client.callTool(
        { name: tool.toolName, arguments: input },
        {
          ...request,
          // A supplied definition also disables the SDK's implicit header-mismatch retry.
          toolDefinition: definition,
        },
      );
      return {
        content: result.content,
        ...(result.structuredContent === undefined
          ? {}
          : { structuredContent: result.structuredContent }),
        ...(result.isError ? { isError: true } : {}),
      };
    },
  );
}
