import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { JsonSchema, ZodInputSchema } from "@plico-ai/contracts";
import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });
const addFormats = createRequire(import.meta.url)("ajv-formats") as (instance: Ajv) => void;
addFormats(ajv);

export type ToolInputParseResult =
  | { success: true; value: unknown }
  | { success: false; error: string };

export interface NormalizedInputSchema {
  jsonSchema: JsonSchema;
  parse(value: unknown): Promise<ToolInputParseResult>;
}

export async function normalizeInputSchema(
  value: unknown,
  source: string,
  toolPath: string,
): Promise<NormalizedInputSchema> {
  if (isZodSchema(value)) {
    return {
      jsonSchema: await convertZodSchema(value, source, toolPath),
      async parse(input) {
        const result = await value.safeParseAsync(input);
        if (result.success) return { success: true, value: result.data };
        return {
          success: false,
          error: result.error.issues
            .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
            .join("; "),
        };
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
    jsonSchema: value,
    async parse(input) {
      const error = validateJsonSchemaWithAjv(input, validator);
      return error ? { success: false, error } : { success: true, value: input };
    },
  };
}

export function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "boolean" || isJsonObject(value);
}

function validateJsonSchemaWithAjv(
  value: unknown,
  validator: ValidateFunction,
): string | undefined {
  if (validator(value)) return undefined;
  const issues = validator.errors?.map(formatAjvIssue) ?? [];
  return issues.length === 0 ? "input does not match the schema" : issues.join("; ");
}

function formatAjvIssue(issue: ErrorObject): string {
  const path = jsonPointerPath(issue.instancePath);
  if (issue.keyword === "required") {
    const property = (issue.params as { missingProperty: string }).missingProperty;
    return `${location(path ? `${path}.${property}` : property)}missing required property ${property}`;
  }
  if (issue.keyword === "additionalProperties") {
    const property = (issue.params as { additionalProperty: string }).additionalProperty;
    return `${location(path ? `${path}.${property}` : property)}unknown property ${property}`;
  }
  if (issue.keyword === "type") {
    return `${location(path)}expected ${(issue.params as { type: string }).type}`;
  }
  return `${location(path)}${issue.message ?? "invalid"}`;
}

function location(path: string): string {
  return path ? `${path}: ` : "";
}

function jsonPointerPath(instancePath: string): string {
  return instancePath
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");
}

async function convertZodSchema(
  schema: ZodInputSchema,
  source: string,
  toolPath: string,
): Promise<JsonSchema> {
  if (!isJsonObject(schema) || !("_zod" in schema)) {
    throw new Error(
      `${source} uses a Zod 3 schema. Plico needs Zod 4: upgrade zod, or import from "zod/v4" (available in zod 3.25), or use JSON Schema`,
    );
  }

  try {
    const requireFromTool = createRequire(toolPath);
    const zodV4ModulePath = requireFromTool.resolve("zod/v4");
    const zodV4 = (await import(pathToFileURL(zodV4ModulePath).href)) as {
      toJSONSchema?: (zodSchema: unknown, options: { target: "draft-7" }) => JsonSchema;
    };
    if (typeof zodV4.toJSONSchema !== "function") {
      throw new Error("The installed Zod v4 package does not export toJSONSchema");
    }
    return zodV4.toJSONSchema(schema, { target: "draft-7" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} could not convert its Zod 4 schema to JSON Schema: ${message}`);
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isZodSchema(value: unknown): value is ZodInputSchema {
  return isJsonObject(value) && typeof value.safeParseAsync === "function";
}
