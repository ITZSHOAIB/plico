import { isRecord } from "../guards.js";
import type { DeclaredTool } from "../types/index.js";
import { normalizeInputSchema } from "./schema.js";

export function normalizeDeclaredTool(value: unknown, source: string): DeclaredTool {
  if (!isRecord(value)) {
    throw new Error(`${source} must default export a declared tool object`);
  }

  const { name, description, inputSchema, capabilities, approval, handler } = value;
  if (typeof name !== "string") {
    throw new Error(`${source} tool name must be a string`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`${source} tool name must match /^[a-z][a-z0-9_]*$/`);
  }
  if (typeof description !== "string") {
    throw new Error(`${source} tool description must be a string`);
  }
  const normalizedInputSchema = normalizeInputSchema(inputSchema, source);
  if (
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === "string")
  ) {
    throw new Error(`${source} capabilities must be an array of strings`);
  }
  if (!isRecord(approval) || typeof approval.required !== "boolean") {
    throw new Error(`${source} approval must declare a required boolean`);
  }
  if (!isToolHandler(handler)) {
    throw new Error(`${source} handler must be a function`);
  }

  return {
    source,
    name,
    description,
    inputSchema: normalizedInputSchema.jsonSchema,
    validateInput: normalizedInputSchema.validate,
    capabilities,
    approval: {
      required: approval.required,
      ...(typeof approval.reason === "string" ? { reason: approval.reason } : {}),
    },
    handler,
  };
}

function isToolHandler(value: unknown): value is DeclaredTool["handler"] {
  return typeof value === "function";
}
