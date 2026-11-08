import { describe, expect, expectTypeOf, it } from "vitest";
import { defineConfig, defineTool } from "./index.js";

// A Zod-shaped schema, so the test needs no zod install.
interface FakeZod<T> {
  safeParseAsync(
    input: unknown,
  ): Promise<
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }
  >;
}
const zodLike: FakeZod<{ city: string; days?: number }> = {
  safeParseAsync: async (input) => ({ success: true, data: input as { city: string } }),
};

const base = { description: "d", capabilities: [], approval: { required: false } };

describe("defineTool", () => {
  it("returns the tool unchanged", () => {
    const handler = async () => "ok";
    const tool = defineTool({ ...base, name: "t", inputSchema: { type: "object" }, handler });

    expect(tool.handler).toBe(handler);
    expect(tool.name).toBe("t");
  });

  it("infers required and optional properties from a JSON Schema without `as const`", () => {
    defineTool({
      ...base,
      name: "t",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          priority: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
          kind: { enum: ["bug", "task"] },
        },
        required: ["title"],
        additionalProperties: false,
      },
      handler: (input) => {
        expectTypeOf(input.title).toEqualTypeOf<string>();
        expectTypeOf(input.priority).toEqualTypeOf<number | undefined>();
        expectTypeOf(input.tags).toEqualTypeOf<string[] | undefined>();
        expectTypeOf(input.kind).toEqualTypeOf<"bug" | "task" | undefined>();
        // @ts-expect-error not declared in the schema
        input.missing;
        return input.title;
      },
    });
  });

  it("falls back to unknown for schema keywords it does not read", () => {
    defineTool({
      ...base,
      name: "t",
      inputSchema: { oneOf: [{ type: "string" }, { type: "number" }] },
      handler: (input) => {
        expectTypeOf(input).toEqualTypeOf<unknown>();
        return null;
      },
    });
  });

  it("infers the input from a Zod-shaped schema", () => {
    defineTool({
      ...base,
      name: "t",
      inputSchema: zodLike,
      handler: (input) => {
        expectTypeOf(input).toEqualTypeOf<{ city: string; days?: number }>();
        return null;
      },
    });
  });

  it("types the handler context", () => {
    defineTool({
      ...base,
      name: "t",
      inputSchema: true,
      handler: (_input, context) => {
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        expectTypeOf(context.idempotencyKey).toEqualTypeOf<string>();
        return null;
      },
    });
  });

  it("rejects a tool without a name", () => {
    // @ts-expect-error name is required
    defineTool({ ...base, inputSchema: true, handler: () => null });
  });
});

describe("defineConfig", () => {
  it("returns the config unchanged", () => {
    const config = { schemaVersion: 1, name: "Demo" };

    expect(defineConfig(config)).toBe(config);
  });

  it("checks the config shape", () => {
    // @ts-expect-error schemaVersion must be a number
    defineConfig({ schemaVersion: "1", name: "Demo" });
    // @ts-expect-error unknown top-level key
    defineConfig({ schemaVersion: 1, name: "Demo", modle: {} });
  });
});
