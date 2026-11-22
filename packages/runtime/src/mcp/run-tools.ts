import type { LoadedProject, McpServerConfig, McpTool } from "@plico-ai/contracts";
import { isJsonSchema } from "@plico-ai/core";
import type { InMemoryEventLog } from "../events.js";
import { discoverTools } from "../tools/index.js";
import type { DeclaredTool, DryRunScriptStep } from "../types/index.js";
import { declareMcpTool } from "./declared-tool.js";
import { discoverMcpTools } from "./discover.js";
import { mcpToolName, toMcpTool } from "./normalize.js";

export async function discoverRunTools(
  project: LoadedProject,
  signal: AbortSignal,
  script: DryRunScriptStep[] | undefined,
  events: InMemoryEventLog,
  mockTools = false,
): Promise<DeclaredTool[]> {
  const tools = await discoverTools(project);
  const sources = Object.fromEntries(
    Object.entries(project.config.mcpServers ?? {}).filter(
      ([id, source]) =>
        script === undefined || script.some((step) => callsSource(step, id, source)),
    ),
  );
  const liveSources = Object.fromEntries(
    Object.entries(sources).filter(
      ([id, source]) =>
        !mockTools ||
        script === undefined ||
        script.some((step) => callsSource(step, id, source) && step.live === true),
    ),
  );
  const mocked = Object.entries(sources)
    .filter(([id]) => !(id in liveSources))
    .flatMap(([id, source]) =>
      source.tools.map((name) => toMcpTool(id, { name, inputSchema: { type: "object" } })),
    );
  const recorded = events.all().find((event) => event.type === "tools.discovered");
  if (recorded) {
    for (const event of events.all()) {
      if (event.type === "run.warning" && event.payload.phase === "mcp.discovery")
        await events.append("run.warning", event.payload);
    }
  }
  const discoverLive = async (): Promise<McpTool[]> => {
    if (script !== undefined)
      return discoverMcpTools(
        { ...project, config: { ...project.config, mcpServers: liveSources } },
        { signal },
      );
    const discovered = await Promise.all(
      Object.entries(liveSources).map(async ([id, source]) => {
        try {
          return {
            tools: await discoverMcpTools(
              { ...project, config: { ...project.config, mcpServers: { [id]: source } } },
              { signal },
            ),
          };
        } catch (error) {
          return {
            tools: [],
            warning: {
              phase: "mcp.discovery",
              serverId: id,
              message:
                error instanceof Error ? error.message : `MCP server ${id}: discovery failed.`,
            },
          };
        }
      }),
    );
    if (signal.aborted) throw new Error("MCP discovery cancelled.");
    for (const source of discovered) {
      if (source.warning) await events.append("run.warning", source.warning);
    }
    return discovered.flatMap((source) => source.tools);
  };
  const metadata: McpTool[] =
    recorded?.type === "tools.discovered"
      ? recorded.payload.tools.flatMap((tool) => {
          if (!tool.mcp) return [];
          if (!isJsonSchema(tool.inputSchema))
            throw new Error(`Invalid recorded schema for ${tool.source}.`);
          return [
            {
              ...tool,
              inputSchema: tool.inputSchema,
              serverId: tool.mcp.serverId,
              toolName: tool.mcp.toolName,
            },
          ];
        })
      : [...mocked, ...(await discoverLive())];
  for (const tool of metadata) {
    const first = tools.find((entry) => entry.name === tool.name);
    if (first)
      throw new Error(
        `Duplicate tool name "${tool.name}" declared in ${first.source} and ${tool.source}`,
      );
    tools.push(declareMcpTool(project, tool));
  }
  return tools;
}

function callsSource(
  step: DryRunScriptStep,
  id: string,
  source: McpServerConfig,
): step is Extract<DryRunScriptStep, { type: "tool.call" }> {
  return (
    step.type === "tool.call" &&
    source.tools.some((name) => step.toolName === mcpToolName(id, name))
  );
}
