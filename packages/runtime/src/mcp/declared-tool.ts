import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import type { LoadedProject, McpTool } from "@plico-ai/contracts";
import type { DeclaredTool, ToolInputParseResult } from "../types/index.js";

export function declareMcpTool(project: LoadedProject, tool: McpTool): DeclaredTool {
  if (typeof tool.inputSchema !== "object" || tool.inputSchema === null)
    throw new Error(`${tool.source}: input schema must be an object.`);
  let validate: ReturnType<AjvJsonSchemaValidator["getValidator"]>;
  try {
    validate = new AjvJsonSchemaValidator().getValidator(tool.inputSchema);
  } catch {
    throw new Error(`${tool.source}: invalid input schema.`);
  }
  const parseInput = async (input: unknown): Promise<ToolInputParseResult> =>
    validate(input).valid
      ? { success: true, value: input }
      : { success: false, error: "Arguments do not match the MCP input schema." };
  return {
    ...tool,
    mcp: {
      serverId: tool.serverId,
      toolName: tool.toolName,
      replayOnCrash:
        project.config.mcpServers?.[tool.serverId]?.replayOnCrash?.includes(tool.toolName) === true,
    },
    parseInput,
    async validateInput(input) {
      const result = await parseInput(input);
      return result.success ? undefined : result.error;
    },
    async handler(input, context) {
      const { callMcpTool } = await import("./call.js");
      return callMcpTool(project, tool, input as Record<string, unknown>, context.signal);
    },
  };
}
