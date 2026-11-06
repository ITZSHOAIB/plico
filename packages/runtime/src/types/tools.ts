import type { JsonValue } from "@plico/contracts";
import type { ZodTypeAny } from "zod";

export interface JsonSchemaSubset {
  [keyword: string]: JsonValue | undefined;
}

export type JsonSchema = JsonSchemaSubset | boolean;
export type ToolInputSchema = JsonSchema | ZodTypeAny;

export interface ToolApprovalPolicy {
  required: boolean;
  reason?: string;
}

export interface ToolHandlerContext {
  /** Aborts when the run is cancelled. Pass it to fetch or a child process to stop early. */
  signal: AbortSignal;
  /**
   * Names this tool call and stays the same if the call runs again after a crash. Pass it to
   * an API that accepts an idempotency key so a repeat does not act twice.
   */
  idempotencyKey: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: unknown, context: ToolHandlerContext) => unknown | Promise<unknown>;
}

export interface DeclaredTool extends Omit<ToolDefinition, "inputSchema"> {
  source: string;
  inputSchema: JsonSchema;
  validateInput(input: unknown): Promise<string | undefined>;
}
