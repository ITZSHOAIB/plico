import type { JsonSchema, ToolDefinition } from "@plico-ai/contracts";

export type {
  JsonSchema,
  JsonSchemaObject,
  ToolApprovalPolicy,
  ToolArtifactContext,
  ToolArtifactFile,
  ToolDefinition,
  ToolHandlerContext,
  ToolInputSchema,
  ZodInputParseResult,
  ZodInputSchema,
} from "@plico-ai/contracts";

export type ToolInputParseResult =
  | { success: true; value: unknown }
  | { success: false; error: string };

export interface DeclaredTool extends Omit<ToolDefinition, "inputSchema"> {
  source: string;
  inputSchema: JsonSchema;
  validateInput(input: unknown): Promise<string | undefined>;
  parseInput(input: unknown): Promise<ToolInputParseResult>;
}
