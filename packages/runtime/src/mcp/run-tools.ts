import type { LoadedProject, McpTool } from "@plico-ai/contracts";
import { isJsonSchema } from "@plico-ai/core";
import { discoverTools } from "../tools/index.js";
import type { DeclaredTool, DryRunScriptStep, PlicoEvent } from "../types/index.js";
import { discoverMcpTools } from "./discover.js";
import { mcpToolName, toMcpTool } from "./normalize.js";

export async function discoverRunTools(
  project: LoadedProject,
  signal: AbortSignal,
  script: DryRunScriptStep[] | undefined,
  events: PlicoEvent[],
  mockTools = false,
): Promise<DeclaredTool[]> {
  const tools = await discoverTools(project);
  const sources = Object.fromEntries(
    Object.entries(project.config.mcpServers ?? {}).filter(
      ([id, source]) =>
        script === undefined ||
        script.some(
          (step) =>
            step.type === "tool.call" &&
            source.tools.some((name) => step.toolName === mcpToolName(id, name)),
        ),
    ),
  );
  const liveSources = Object.fromEntries(
    Object.entries(sources).filter(
      ([id, source]) =>
        !mockTools ||
        script === undefined ||
        script.some(
          (step) =>
            step.type === "tool.call" &&
            step.live === true &&
            source.tools.some((name) => step.toolName === mcpToolName(id, name)),
        ),
    ),
  );
  const mocked = Object.entries(sources)
    .filter(([id]) => !(id in liveSources))
    .flatMap(([id, source]) =>
      source.tools.map((name) => toMcpTool(id, { name, inputSchema: { type: "object" } })),
    );
  const recorded = events.find((event) => event.type === "tools.discovered");
  const metadata: McpTool[] =
    recorded?.type === "tools.discovered"
      ? recorded.payload.tools
          .filter((tool) => tool.source.startsWith("mcp:"))
          .map((tool) => {
            const slash = tool.source.indexOf("/");
            if (!isJsonSchema(tool.inputSchema))
              throw new Error(`Invalid recorded schema for ${tool.source}.`);
            return {
              ...tool,
              inputSchema: tool.inputSchema,
              serverId: tool.source.slice(4, slash),
              toolName: tool.source.slice(slash + 1),
            };
          })
      : [
          ...mocked,
          ...(await discoverMcpTools(
            { ...project, config: { ...project.config, mcpServers: liveSources } },
            { signal },
          )),
        ];
  for (const tool of metadata) {
    const first = tools.find((entry) => entry.name === tool.name);
    if (first)
      throw new Error(
        `Duplicate tool name "${tool.name}" declared in ${first.source} and ${tool.source}`,
      );
    const { declareMcpTool } = await import("./declared-tool.js");
    tools.push(declareMcpTool(project, tool));
  }
  return tools;
}
