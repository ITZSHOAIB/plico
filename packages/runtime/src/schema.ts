import type { JsonSchemaSubset } from "./types.js";

export function validateJsonSchemaSubset(
  value: unknown,
  schema: JsonSchemaSubset,
): string | undefined {
  switch (schema.type) {
    case "object":
      return validateObject(value, schema);
    case "string":
      return typeof value === "string" ? undefined : "expected string";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "expected number";
    case "integer":
      return Number.isInteger(value) ? undefined : "expected integer";
    case "boolean":
      return typeof value === "boolean" ? undefined : "expected boolean";
    case "array":
      return validateArray(value, schema);
  }
}

export function isJsonSchemaSubset(value: unknown): value is JsonSchemaSubset {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (!["object", "string", "number", "integer", "boolean", "array"].includes(value.type)) {
    return false;
  }

  if (value.properties !== undefined) {
    if (!isRecord(value.properties)) {
      return false;
    }

    for (const propertySchema of Object.values(value.properties)) {
      if (!isJsonSchemaSubset(propertySchema)) {
        return false;
      }
    }
  }

  if (value.required !== undefined) {
    if (
      !Array.isArray(value.required) ||
      !value.required.every((entry) => typeof entry === "string")
    ) {
      return false;
    }
  }

  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== "boolean") {
    return false;
  }

  if (value.items !== undefined && !isJsonSchemaSubset(value.items)) {
    return false;
  }

  return true;
}

function validateObject(value: unknown, schema: JsonSchemaSubset): string | undefined {
  if (!isRecord(value) || Array.isArray(value)) {
    return "expected object";
  }

  for (const property of schema.required ?? []) {
    if (!Object.hasOwn(value, property)) {
      return `missing required property ${property}`;
    }
  }

  const properties = schema.properties ?? {};
  for (const [property, propertyValue] of Object.entries(value)) {
    const propertySchema = properties[property];
    if (!propertySchema) {
      if (schema.additionalProperties === false) {
        return `unknown property ${property}`;
      }
      continue;
    }

    const error = validateJsonSchemaSubset(propertyValue, propertySchema);
    if (error) {
      return `${property}: ${error}`;
    }
  }

  return undefined;
}

function validateArray(value: unknown, schema: JsonSchemaSubset): string | undefined {
  if (!Array.isArray(value)) {
    return "expected array";
  }

  if (!schema.items) {
    return undefined;
  }

  for (const [index, item] of value.entries()) {
    const error = validateJsonSchemaSubset(item, schema.items);
    if (error) {
      return `${index}: ${error}`;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
