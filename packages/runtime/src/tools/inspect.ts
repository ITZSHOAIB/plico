import type { LoadedProject, ToolInspection, ToolsReport } from "@plico-ai/contracts";
import { mcpToolName } from "../mcp/normalize.js";
import { decideApproval } from "../policy/approval.js";
import type { DeclaredTool } from "../types/index.js";
import { discoverTools } from "./discover.js";

/** Non-live inventory of declared tools and config allowlists for Studio and readiness. */
export async function inspectTools(project: LoadedProject): Promise<ToolsReport> {
  const tools: ToolInspection[] = (await discoverTools(project)).map((tool) =>
    toInspection(project, tool),
  );
  for (const [serverId, source] of Object.entries(project.config.mcpServers ?? {})) {
    for (const toolName of source.tools) {
      const name = mcpToolName(serverId, toolName);
      const existing = tools.find((tool) => tool.name === name);
      if (existing)
        throw new Error(
          `Duplicate tool name "${name}" declared in ${existing.source} and mcp:${serverId}/${toolName}.`,
        );
      tools.push({
        name,
        description: `MCP tool ${toolName} from server ${serverId}.`,
        source: `mcp:${serverId}/${toolName}`,
        capabilities: [],
        approval: decideApproval(
          { name, approval: { required: true }, mcp: { serverId, toolName } },
          project.config,
        ),
        mcp: { serverId, toolName },
      });
    }
  }
  tools.sort((left, right) => left.name.localeCompare(right.name));
  return { tools };
}

function toInspection(project: LoadedProject, tool: DeclaredTool): ToolInspection {
  return {
    name: tool.name,
    description: tool.description,
    source: tool.source,
    capabilities: tool.capabilities,
    approval: decideApproval(tool, project.config),
    ...(tool.mcp === undefined
      ? {}
      : {
          mcp: {
            serverId: tool.mcp.serverId,
            toolName: tool.mcp.toolName,
          },
        }),
  };
}
