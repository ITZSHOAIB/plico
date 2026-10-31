import type { JsonSchemaSubset } from "./tools.js";

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ModelToolCall {
  name: string;
  arguments: unknown;
}

export interface ModelRequest {
  messages: ProviderMessage[];
  maxSteps: number;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: JsonSchemaSubset;
  }>;
}

export interface ModelResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: ModelToolCall[];
}

export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>;
}
