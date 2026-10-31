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

export interface DeclaredTool {
  source: string;
  name: string;
  description: string;
  inputSchema: JsonSchemaSubset;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: unknown) => unknown | Promise<unknown>;
}
