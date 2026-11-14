import type { JsonSchema, JsonValue } from "@plico-ai/contracts";
import { normalizeInputSchema } from "@plico-ai/core";
import { RuntimeDiagnosticError } from "../errors.js";
import type { InMemoryEventLog } from "../events.js";
import type { ModelRequest, ModelResponse } from "../types/index.js";
import { resultToolSchema } from "./result-tool-schema.js";

const SUBMIT_RESULT = "submit_result";

export interface ProviderRunOutput {
  output: string;
  structuredOutput?: JsonValue;
}

type OutputAction = { kind: "complete"; result: ProviderRunOutput } | { kind: "repair" };

interface StructuredOutput {
  tools: NonNullable<ModelRequest["tools"]>;
  handle(
    response: ModelResponse,
    messages: ModelRequest["messages"],
    events: InMemoryEventLog,
    canRepair: boolean,
  ): Promise<OutputAction | undefined>;
}

/** Scripted runs have no provider repair turn; their final text must already be valid JSON. */
export async function validateStructuredText(
  schema: JsonSchema,
  content: string | undefined,
): Promise<JsonValue> {
  let value: unknown;
  try {
    value = JSON.parse(content ?? "");
  } catch {
    throw new RuntimeDiagnosticError({
      phase: "output.validation",
      message: "Structured output is not valid JSON.",
    });
  }
  const normalized = await normalizeInputSchema(schema, "output", import.meta.filename);
  const parsed = await normalized.parse(value);
  if (!parsed.success)
    throw new RuntimeDiagnosticError({
      phase: "output.validation",
      message: `Structured output is invalid: ${parsed.error}`,
    });
  return value as JsonValue;
}

/** Owns final-result validation and the single fallback repair turn, separate from tool recovery. */
export async function createStructuredOutput(
  schema: JsonSchema,
  native: boolean,
): Promise<StructuredOutput> {
  const normalized = await normalizeInputSchema(schema, "output", import.meta.filename);
  let repairs = 0;
  return {
    tools: native
      ? []
      : [
          {
            name: SUBMIT_RESULT,
            description:
              "Submit the final value in result. Call this tool alone when all work is done.",
            inputSchema: resultToolSchema(schema),
          },
        ],
    async handle(
      response: ModelResponse,
      messages: ModelRequest["messages"],
      events: InMemoryEventLog,
      canRepair: boolean,
    ): Promise<OutputAction | undefined> {
      const calls = response.toolCalls ?? [];
      const submission = calls.find((call) => call.name === SUBMIT_RESULT);
      if (calls.length > 0 && !submission) return undefined;

      if (submission) {
        for (const call of calls)
          await events.append("tool.call", { toolName: call.name, arguments: call.arguments });
      }
      let value: unknown;
      let error: string | undefined;
      if (submission && (native || calls.length !== 1)) {
        error = "Call submit_result alone, after all other tool calls have finished.";
      } else if (submission) {
        const args = submission.arguments;
        if (
          !args ||
          typeof args !== "object" ||
          Array.isArray(args) ||
          Object.keys(args).length !== 1 ||
          !("result" in args) ||
          args.result === undefined
        ) {
          error = "submit_result arguments must contain only the result value.";
        } else value = args.result;
      } else if (!native) {
        error =
          "A structured result is required. Call submit_result with a value matching the output schema.";
      } else {
        try {
          value = JSON.parse(response.content);
        } catch {
          error = "Structured output is not valid JSON.";
        }
      }
      if (error === undefined) {
        const parsed = await normalized.parse(value);
        if (!parsed.success) error = `Structured output is invalid: ${parsed.error}`;
      }
      if (error !== undefined) {
        const failure = new RuntimeDiagnosticError({ phase: "output.validation", message: error });
        if (native || ++repairs > 1 || !canRepair) throw failure;
        messages.push({
          role: "assistant",
          content: response.content,
          ...(calls.length ? { toolCalls: calls } : {}),
          ...(response.providerMetadata === undefined
            ? {}
            : { providerMetadata: response.providerMetadata }),
        });
        if (calls.length === 0) messages.push({ role: "user", content: error });
        for (const call of calls) {
          const result = { error };
          await events.append("tool.result", { toolName: call.name, result });
          messages.push({
            role: "tool",
            content: JSON.stringify(result),
            toolName: call.name,
            ...(call.id === undefined ? {} : { toolCallId: call.id }),
          });
        }
        return { kind: "repair" };
      }

      const structuredOutput = value as JsonValue;
      if (submission)
        await events.append("tool.result", { toolName: SUBMIT_RESULT, result: structuredOutput });
      const output = native ? response.content : JSON.stringify(structuredOutput);
      await events.append("assistant.output", { content: output });
      return { kind: "complete", result: { output, structuredOutput } };
    },
  };
}
