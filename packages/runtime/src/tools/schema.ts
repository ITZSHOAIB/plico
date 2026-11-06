import { createRequire } from "node:module";
import { Ajv, type AnySchema, type ValidateFunction } from "ajv";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema } from "../types/index.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const addFormats = createRequire(import.meta.url)("ajv-formats") as (instance: Ajv) => void;
addFormats(ajv);

export interface NormalizedInputSchema {
  jsonSchema: JsonSchema;
  validate(value: unknown): Promise<string | undefined>;
}

export function normalizeInputSchema(value: unknown, source: string): NormalizedInputSchema {
  if (isZodSchema(value)) {
    return {
      jsonSchema: zodToJsonSchema(value) as JsonSchema,
      async validate(input) {
        const result = await value.safeParseAsync(input);
        if (result.success) return undefined;
        return result.error.issues
          .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
          .join("; ");
      },
    };
  }

  if (!isJsonSchema(value)) {
    throw new Error(`${source} inputSchema must be a Zod schema or JSON Schema`);
  }

  let validator: ValidateFunction;
  try {
    validator = ajv.compile(value as AnySchema);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} inputSchema is not a valid JSON Schema: ${message}`);
  }

  return {
    jsonSchema: value as JsonSchema,
    async validate(input) {
      return validateJsonSchemaWithAjv(input, validator);
    },
  };
}

export function validateJsonSchema(value: unknown, schema: JsonSchema): string | undefined {
  return validateJsonSchemaWithAjv(value, ajv.compile(schema as AnySchema));
}

export function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "boolean" || isJsonObject(value);
}

export function isJsonSchemaSubset(value: unknown): value is JsonSchema {
  return isJsonSchema(value);
}

export function validateJsonSchemaSubset(value: unknown, schema: JsonSchema): string | undefined {
  return validateJsonSchema(value, schema);
}

function validateJsonSchemaWithAjv(
  value: unknown,
  validator: ValidateFunction,
): string | undefined {
  if (validator(value)) return undefined;
  const issue = validator.errors?.[0];
  if (!issue) return "input does not match the schema";
  const path = issue.instancePath.replace(/^\//, "").replaceAll("/", ".");
  if (issue.keyword === "required") {
    return `missing required property ${(issue.params as { missingProperty: string }).missingProperty}`;
  }
  if (issue.keyword === "additionalProperties") {
    return `unknown property ${(issue.params as { additionalProperty: string }).additionalProperty}`;
  }
  if (issue.keyword === "type") {
    return `expected ${(issue.params as { type: string }).type}`;
  }
  return path ? `${path}: ${issue.message ?? "invalid"}` : (issue.message ?? "invalid");
}

function isJsonObject(value: unknown): value is JsonSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    isJsonObject(value) &&
    typeof (value as { safeParseAsync?: unknown }).safeParseAsync === "function"
  );
}
