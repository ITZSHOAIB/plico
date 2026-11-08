import type {
  ProjectConfig,
  ToolApprovalPolicy,
  ToolDefinition,
  ToolHandlerContext,
} from "@plico/contracts";
import type { InferToolInput, SchemaInput } from "./infer.js";

export type {
  ProjectConfig,
  ToolApprovalPolicy,
  ToolArtifactContext,
  ToolDefinition,
  ToolHandlerContext,
} from "@plico/contracts";
export type { InferToolInput } from "./infer.js";

/** A tool as written in `tools/*.tool.ts`, with the handler input typed from `inputSchema`. */
export interface ToolSpec<Schema extends SchemaInput> {
  name: string;
  description: string;
  inputSchema: Schema;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: InferToolInput<Schema>, context: ToolHandlerContext) => unknown;
}

/** Declare a tool. Returns the object unchanged; the types infer `input` from `inputSchema`. */
export function defineTool<const Schema extends SchemaInput>(
  tool: ToolSpec<Schema>,
): ToolDefinition {
  return tool as unknown as ToolDefinition;
}

/** Declare `plico.config.ts`. Returns the object unchanged; the types check it. */
export function defineConfig(config: ProjectConfig): ProjectConfig {
  return config;
}
