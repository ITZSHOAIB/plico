import type { ZodInputSchema } from "@plico/contracts";

/** JSON Schema as written in a tool file: `const` inference makes its arrays readonly. */
export type ReadonlyJson =
  | string
  | number
  | boolean
  | null
  | readonly ReadonlyJson[]
  | { readonly [keyword: string]: ReadonlyJson | undefined };

export type SchemaInput =
  | boolean
  | ZodInputSchema
  | { readonly [keyword: string]: ReadonlyJson | undefined };

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type RequiredKeys<S> = S extends { required: readonly (infer R)[] } ? R & string : never;

type InferObject<S> = S extends { properties: infer P }
  ? Simplify<
      { [K in keyof P & RequiredKeys<S>]: InferJsonSchema<P[K]> } & {
        [K in Exclude<keyof P, RequiredKeys<S>>]?: InferJsonSchema<P[K]>;
      }
    >
  : Record<string, unknown>;

/**
 * The TypeScript type of a JSON Schema value, for the keywords tools use most: `type`, `enum`,
 * `const`, `properties`, `required` and `items`. Anything else is `unknown`, never an error.
 */
export type InferJsonSchema<S> = S extends { const: infer C }
  ? C
  : S extends { enum: readonly (infer E)[] }
    ? E
    : S extends { type: "string" }
      ? string
      : S extends { type: "number" | "integer" }
        ? number
        : S extends { type: "boolean" }
          ? boolean
          : S extends { type: "null" }
            ? null
            : S extends { type: "array"; items: infer Item }
              ? InferJsonSchema<Item>[]
              : S extends { type: "array" }
                ? unknown[]
                : S extends { type: "object" }
                  ? InferObject<S>
                  : unknown;

type InferZod<S> = S extends { safeParseAsync(input: unknown): Promise<infer Result> }
  ? Extract<Result, { success: true }> extends { data: infer Data }
    ? Data
    : unknown
  : unknown;

/** The input a tool handler receives, from either a Zod schema or a JSON Schema. */
export type InferToolInput<S> = S extends ZodInputSchema ? InferZod<S> : InferJsonSchema<S>;
