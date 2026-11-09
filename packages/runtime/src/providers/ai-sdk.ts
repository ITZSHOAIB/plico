import type { JsonValue } from "@plico/contracts";
import {
  APICallError,
  dynamicTool,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  streamText,
  type ToolSet,
} from "ai";
import { ModelProviderError } from "../errors.js";
import type { ModelProvider, ModelRequest } from "../types/index.js";

function toMessages(request: ModelRequest): ModelMessage[] {
  return request.messages.map((message): ModelMessage => {
    if (message.role === "system" || message.role === "user")
      return { role: message.role, content: message.content };
    if (message.role === "tool")
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId ?? "",
            toolName: message.toolName ?? "",
            output: { type: "text", value: message.content },
          },
        ],
      };
    const metadata = message.providerMetadata;
    const envelope =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : undefined;
    const adapter = envelope?.plicoAdapter;
    const reasoning =
      adapter &&
      typeof adapter === "object" &&
      !Array.isArray(adapter) &&
      typeof adapter.reasoning === "string"
        ? adapter.reasoning
        : undefined;
    const providerOptions = (envelope?.sdk ?? metadata) as NonNullable<
      ModelMessage["providerOptions"]
    >;
    return {
      role: "assistant",
      ...(providerOptions === undefined ? {} : { providerOptions }),
      content: [
        ...(reasoning ? [{ type: "reasoning" as const, text: reasoning }] : []),
        ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
        ...(message.toolCalls ?? []).map((call) => ({
          type: "tool-call" as const,
          toolCallId: call.id ?? "",
          toolName: call.name,
          input: call.arguments,
          ...(call.providerMetadata === undefined
            ? {}
            : {
                providerOptions: call.providerMetadata as NonNullable<
                  ModelMessage["providerOptions"]
                >,
              }),
        })),
      ],
    };
  });
}

function toTools(request: ModelRequest): ToolSet {
  return Object.fromEntries(
    (request.tools ?? []).map((entry) => [
      entry.name,
      dynamicTool({ description: entry.description, inputSchema: jsonSchema(entry.inputSchema) }),
    ]),
  );
}

export interface AiSdkProviderOptions {
  /** The variable that holds the credential. Without one, the model is built with no key. */
  apiKeyEnv?: string | undefined;
  /** Builds the AI SDK model once the credential is known. */
  createModel: (apiKey: string | undefined) => LanguageModel | Promise<LanguageModel>;
}

/** Wraps an AI SDK language model behind the Plico model port. Provider retries are off. */
export function createAiSdkModelProvider(options: AiSdkProviderOptions): ModelProvider {
  return {
    async *stream(request, { signal }) {
      try {
        const apiKey = options.apiKeyEnv ? process.env[options.apiKeyEnv] : undefined;
        if (options.apiKeyEnv && !apiKey)
          throw new ModelProviderError(
            "auth",
            `Missing model provider credential: set ${options.apiKeyEnv}.`,
          );
        // Setup problems (a missing adapter package, a broken provider module) are local and
        // actionable, so their message is kept. They are not a network failure and not retried.
        let model: LanguageModel;
        try {
          model = await options.createModel(apiKey);
        } catch (error) {
          throw new ModelProviderError(
            "bad_request",
            error instanceof Error ? error.message : "Model provider setup failed.",
          );
        }
        const response = streamText({
          model,
          messages: toMessages(request),
          tools: toTools(request),
          allowSystemInMessages: true,
          maxRetries: 0,
          streamRetries: 0,
          abortSignal: signal,
          onError: () => {},
        });
        let metadata: JsonValue | undefined;
        let reasoning = "";
        for await (const part of response.fullStream) {
          if (part.type === "text-delta") yield { type: "text", text: part.text };
          else if (part.type === "reasoning-delta") reasoning += part.text;
          else if (part.type === "tool-call")
            yield {
              type: "tool.call",
              call: {
                id: part.toolCallId,
                name: part.toolName,
                arguments: part.input,
                ...(part.providerMetadata
                  ? { providerMetadata: part.providerMetadata as JsonValue }
                  : {}),
              },
            };
          else if (part.type === "finish-step")
            metadata = part.providerMetadata as JsonValue | undefined;
          else if (part.type === "error") throw part.error;
          else if (part.type === "finish") {
            if (part.finishReason !== "stop" && part.finishReason !== "tool-calls")
              throw new ModelProviderError(
                "bad_request",
                `Model response did not complete (finish reason: ${part.finishReason}).`,
              );
            yield {
              type: "finish",
              usage: {
                inputTokens: part.totalUsage.inputTokens ?? 0,
                outputTokens: part.totalUsage.outputTokens ?? 0,
              },
              ...(!reasoning && metadata === undefined
                ? {}
                : {
                    providerMetadata: {
                      ...(metadata === undefined ? {} : { sdk: metadata }),
                      ...(reasoning ? { plicoAdapter: { reasoning } } : {}),
                    },
                  }),
            };
          }
        }
      } catch (error) {
        if (signal.aborted) throw new ModelProviderError("aborted", "Model request aborted.");
        if (error instanceof ModelProviderError) throw error;
        if (APICallError.isInstance(error)) {
          const status = error.statusCode;
          if (status === 401 || status === 403)
            throw new ModelProviderError(
              "auth",
              "Model provider authentication failed. Check credentials.",
            );
          if (status === 429)
            throw new ModelProviderError("rate_limit", "Model provider rate limit reached.");
          if (status === 503 || (status !== undefined && status >= 500))
            throw new ModelProviderError("overloaded", "Model provider is unavailable.");
          if (status !== undefined && status >= 400 && isContextLengthError(error))
            throw new ModelProviderError(
              "context_length",
              "The conversation is too long for the model's context window. Start a new thread, or choose a model with a larger context.",
            );
          if (status !== undefined && status >= 400)
            throw new ModelProviderError(
              "bad_request",
              `Model provider rejected the request (HTTP ${status}).`,
            );
        }
        throw new ModelProviderError("network", "Model provider request failed.");
      }
    },
  };
}

const CONTEXT_LENGTH =
  /context[_ ]length|context window|prompt is too long|too many tokens|exceeds? the maximum (number of )?tokens|input token count/i;

/** Providers word this differently, so match the code and message they return for an over-long input. */
function isContextLengthError(error: APICallError): boolean {
  return CONTEXT_LENGTH.test(`${error.message} ${error.responseBody ?? ""}`);
}
