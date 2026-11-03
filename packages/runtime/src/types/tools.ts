export interface JsonSchemaSubset {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  properties?: Record<string, JsonSchemaSubset>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaSubset;
}

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

export interface DeclaredTool {
  source: string;
  name: string;
  description: string;
  inputSchema: JsonSchemaSubset;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: unknown, context: ToolHandlerContext) => unknown | Promise<unknown>;
}
