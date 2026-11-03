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
