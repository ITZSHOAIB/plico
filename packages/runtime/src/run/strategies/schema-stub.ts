import type { JsonSchema, JsonValue } from "@plico-ai/contracts";

type Schema = Record<string, unknown>;

const MAX_DEPTH = 8;

/** The smallest plain value that satisfies `schema`, so a dry run can answer an agent with an output schema. */
export function stubValue(schema: JsonSchema): JsonValue {
  return build(schema as Schema, schema as Schema, 0);
}

function build(schema: Schema, root: Schema, depth: number): JsonValue {
  if (depth > MAX_DEPTH) return null;
  const ref = typeof schema.$ref === "string" ? resolveRef(schema.$ref, root) : undefined;
  if (ref) return build(ref, root, depth + 1);
  if ("const" in schema) return schema.const as JsonValue;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0] as JsonValue;
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const [first] = Array.isArray(schema[key]) ? (schema[key] as Schema[]) : [];
    if (first) return build(first, root, depth + 1);
  }
  const type = Array.isArray(schema.type)
    ? (schema.type.find((item) => item !== "null") ?? "null")
    : schema.type;
  switch (type) {
    case "object": {
      const properties = (schema.properties ?? {}) as Record<string, Schema>;
      const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
      return Object.fromEntries(
        Object.entries(properties)
          .filter(([name]) => required.includes(name))
          .map(([name, property]) => [name, build(property, root, depth + 1)]),
      );
    }
    case "array":
      return Array.from({ length: Number(schema.minItems ?? 0) }, () =>
        build((schema.items ?? {}) as Schema, root, depth + 1),
      );
    case "string":
      return "stub".padEnd(Number(schema.minLength ?? 0), "x");
    case "integer":
    case "number":
      return Number(schema.minimum ?? 0);
    case "boolean":
      return true;
    default:
      return null;
  }
}

function resolveRef(ref: string, root: Schema): Schema | undefined {
  if (!ref.startsWith("#")) return undefined;
  let current: unknown = root;
  for (const part of ref.slice(1).split("/").filter(Boolean))
    current = (current as Schema | undefined)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  return current && typeof current === "object" ? (current as Schema) : undefined;
}
