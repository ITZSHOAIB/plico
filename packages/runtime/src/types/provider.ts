import type { JsonValue, ModelToolCall } from "@plico-ai/contracts";
import type { JsonSchema } from "./tools.js";

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ModelToolCall[];
  providerMetadata?: JsonValue;
}

export type { ModelToolCall } from "@plico-ai/contracts";

export interface ModelRequest {
  messages: ProviderMessage[];
  maxSteps: number;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: JsonSchema;
  }>;
}

export interface ModelResponse {
  providerMetadata?: JsonValue;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: ModelToolCall[];
}

export type ModelChunk =
  | { type: "text"; text: string }
  | { type: "tool.call"; call: ModelToolCall }
  | { type: "finish"; usage: ModelResponse["usage"]; providerMetadata?: JsonValue };

export interface ModelProvider {
  stream(request: ModelRequest, options: { signal: AbortSignal }): AsyncIterable<ModelChunk>;
}
