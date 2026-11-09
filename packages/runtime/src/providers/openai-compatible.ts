import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelProvider } from "../types/index.js";
import { createAiSdkModelProvider } from "./ai-sdk.js";

export interface OpenAICompatibleProviderOptions {
  model: string;
  apiKeyEnv?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): ModelProvider {
  return createAiSdkModelProvider({
    apiKeyEnv: options.apiKeyEnv ?? "OPENAI_API_KEY",
    createModel: (apiKey) =>
      createOpenAICompatible({
        name: "plico",
        baseURL: options.baseURL ?? "https://api.openai.com/v1",
        ...(apiKey ? { apiKey } : {}),
        includeUsage: true,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      })(options.model),
  });
}
