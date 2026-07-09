export interface OpenAIProviderConfig {
  type: "openai";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export type ProviderConfig = OpenAIProviderConfig;
