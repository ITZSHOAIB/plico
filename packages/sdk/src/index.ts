import type {
  ProjectConfig,
  ProviderInput,
  ScorerDefinition,
  ToolApprovalPolicy,
  ToolDefinition,
  ToolHandlerContext,
  WorkflowDefinition,
} from "@plico-ai/contracts";
import type { InferToolInput, SchemaInput } from "./infer.js";

export type {
  McpHttpServerConfig,
  McpServerConfig,
  McpStdioServerConfig,
  ProjectConfig,
  ProviderInput,
  ScoreResult,
  ScorerDefinition,
  ScorerInput,
  ToolApprovalPolicy,
  ToolArtifactContext,
  ToolDefinition,
  ToolHandlerContext,
  WorkflowAgentCall,
  WorkflowContext,
  WorkflowDefinition,
} from "@plico-ai/contracts";
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

/**
 * Declare `providers/<name>.ts`: a function that returns any AI SDK language model. Returns the
 * function unchanged. Plico wraps the model behind its own model port.
 */
export function defineProvider(
  provider: (input: ProviderInput) => unknown,
): (input: ProviderInput) => unknown {
  return provider;
}

/**
 * Declare `evals/scorers/<name>.ts`: a custom eval scorer that sees the whole run and returns a
 * score from 0 to 1. Returns the scorer unchanged.
 */
export function defineScorer(scorer: ScorerDefinition): ScorerDefinition {
  return scorer;
}

/**
 * Declare `workflows/<id>.ts`: a `run` function that calls agents in a fixed order with plain
 * `await`, `if` and `for`. Returns the workflow unchanged.
 */
export function defineWorkflow<Input = unknown>(
  workflow: WorkflowDefinition<Input>,
): WorkflowDefinition<Input> {
  return workflow;
}
