import type { JsonSchema, JsonValue } from "@plico-ai/contracts";

const MAPS = [
  "properties",
  "patternProperties",
  "definitions",
  "$defs",
  "dependentSchemas",
  "dependencies",
];
const CHILDREN = [
  "items",
  "prefixItems",
  "additionalItems",
  "contains",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "contentSchema",
];

/** Keeps document-local references pointing at the original schema after nesting it in result. */
export function resultToolSchema(schema: JsonSchema): JsonSchema {
  const result: JsonValue = JSON.parse(JSON.stringify(schema));
  relocate(result, false);
  return {
    type: "object",
    properties: { result },
    required: ["result"],
    additionalProperties: false,
  };
}

function relocate(schema: JsonValue, scoped: boolean): void {
  if (Array.isArray(schema)) {
    for (const child of schema) relocate(child, scoped);
    return;
  }
  if (schema === null || typeof schema !== "object") return;
  // A schema with its own resource identifier retains its own fragment resolution scope.
  const ownScope = scoped || typeof schema.$id === "string";
  if (!ownScope) {
    for (const key of ["$ref", "$dynamicRef"]) {
      const ref = schema[key];
      if (ref === "#") schema[key] = "#/properties/result";
      else if (typeof ref === "string" && ref.startsWith("#/"))
        schema[key] = `#/properties/result${ref.slice(1)}`;
    }
  }
  for (const key of MAPS) {
    const map = schema[key];
    if (map !== null && typeof map === "object" && !Array.isArray(map))
      for (const child of Object.values(map)) relocate(child, ownScope);
  }
  for (const key of CHILDREN) {
    const child = schema[key];
    if (child !== undefined) relocate(child, ownScope);
  }
}
