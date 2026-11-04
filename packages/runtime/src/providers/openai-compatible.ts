import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { JsonValue } from "@plico/contracts";
import {
  APICallError,
  dynamicTool,
  jsonSchema,
  type ModelMessage,
  streamText,
  type ToolSet,
} from "ai";
import { ModelProviderError } from "../errors.js";
import type { ModelProvider, ModelRequest } from "../types/index.js";

export interface OpenAICompatibleProviderOptions {
  model: string;
  apiKeyEnv?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

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

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): ModelProvider {
  return {
    async *stream(request, { signal }) {
      try {
        const envName = options.apiKeyEnv ?? "OPENAI_API_KEY";
        const apiKey = process.env[envName];
        if (!apiKey)
          throw new ModelProviderError(
            "auth",
            `Missing model provider credential: set ${envName}.`,
          );
        const provider = createOpenAICompatible({
          name: "plico",
          baseURL: options.baseURL ?? "https://api.openai.com/v1",
          apiKey,
          includeUsage: true,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        const response = streamText({
          model: provider(options.model),
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
          else if (part.type === "finish")
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
