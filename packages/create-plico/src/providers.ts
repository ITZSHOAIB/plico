export const PROVIDER_CHOICES = ["anthropic", "openai", "google", "openai-compatible"] as const;

export type ScaffoldProvider = (typeof PROVIDER_CHOICES)[number];

interface ProviderSetup {
  label: string;
  model: string;
  /** The environment variable the provider reads its key from. Absent for a local server. */
  apiKeyEnv?: string;
  baseURL?: string;
  /** The AI SDK adapter package the project installs. Absent when none is needed. */
  adapter?: string;
}

export const PROVIDER_SETUP: Record<ScaffoldProvider, ProviderSetup> = {
  anthropic: {
    label: "Anthropic",
    model: "claude-sonnet-5-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    adapter: "@ai-sdk/anthropic",
  },
  openai: {
    label: "OpenAI",
    model: "gpt-5",
    apiKeyEnv: "OPENAI_API_KEY",
    adapter: "@ai-sdk/openai",
  },
  google: {
    label: "Google",
    model: "gemini-2.5-flash",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    adapter: "@ai-sdk/google",
  },
  "openai-compatible": {
    label: "OpenAI-compatible server (Ollama, OpenRouter, LiteLLM)",
    model: "llama3.1",
    baseURL: "http://localhost:11434/v1",
  },
};

export function isScaffoldProvider(value: string): value is ScaffoldProvider {
  return (PROVIDER_CHOICES as readonly string[]).includes(value);
}
