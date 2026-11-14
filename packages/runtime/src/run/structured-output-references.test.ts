import { normalizeInputSchema } from "@plico-ai/core";
import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { outputProject, outputUsage } from "../testing/structured-output.js";

it("preserves local references when wrapping the result tool schema", async () => {
  const root = await outputProject({
    type: "object",
    definitions: { ticket: { type: "string" } },
    properties: {
      ticket: { $ref: "#/definitions/ticket" },
      literal: { const: { $ref: "#/literal-data" } },
    },
    required: ["ticket", "literal"],
  });
  const result = await runProject(root, {
    message: "Triage",
    provider: {
      async *stream(request) {
        const tool = request.tools?.find((entry) => entry.name === "submit_result");
        const schema = await normalizeInputSchema(
          tool?.inputSchema,
          "submit_result",
          import.meta.filename,
        );
        const args = { result: { ticket: "T-1", literal: { $ref: "#/literal-data" } } };
        expect(await schema.parse(args)).toMatchObject({ success: true });
        yield { type: "tool.call", call: { name: "submit_result", arguments: args } };
        yield { type: "finish", usage: outputUsage };
      },
    },
  });

  expect(result).toMatchObject({
    status: "completed",
    structuredOutput: { ticket: "T-1", literal: { $ref: "#/literal-data" } },
  });
});
