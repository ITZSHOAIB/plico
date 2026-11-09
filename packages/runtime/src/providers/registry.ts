import type { ProjectConfig } from "@plico/contracts";

type ModelConfig = NonNullable<ProjectConfig["model"]>;

interface NativeProvider {
  apiKeyEnv: string;
  /** The endpoint used when neither the config nor the environment sets one. */
  baseURL: string;
  /** Returns an AI SDK language model. Adapter packages may pin another `@ai-sdk/provider` copy, so it is typed loosely here. */
  create: (input: { model: string; apiKey: string; baseURL: string }) => Promise<unknown>;
}

/** The adapters are optional peer packages, so each loads only when its provider is used. */
async function load<T>(packageName: string, importer: () => Promise<T>): Promise<T> {
  try {
    return await importer();
  } catch {
    throw new Error(`Install ${packageName} to use this model provider: pnpm add ${packageName}`);
  }
}

const OPENAI_URL = "https://api.openai.com/v1";

const NATIVE: Record<string, NativeProvider> = {
  anthropic: {
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseURL: "https://api.anthropic.com/v1",
    create: async ({ model, apiKey, baseURL }) =>
      (await load("@ai-sdk/anthropic", () => import("@ai-sdk/anthropic"))).createAnthropic({
        apiKey,
        baseURL,
      })(model),
  },
  google: {
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    create: async ({ model, apiKey, baseURL }) =>
      (await load("@ai-sdk/google", () => import("@ai-sdk/google"))).createGoogleGenerativeAI({
        apiKey,
        baseURL,
      })(model),
  },
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    baseURL: OPENAI_URL,
    // The chat endpoint is the one every OpenAI-compatible server also speaks.
    create: async ({ model, apiKey, baseURL }) =>
      (await load("@ai-sdk/openai", () => import("@ai-sdk/openai")))
        .createOpenAI({ apiKey, baseURL })
        .chat(model),
  },
};

export function nativeProvider(provider: string): NativeProvider | undefined {
  return NATIVE[provider];
}

/** The credential variable and endpoint a configured model uses, for the run and the recovery key. */
export function resolveModelEndpoint(model: ModelConfig): {
  apiKeyEnv: string | undefined;
  baseURL: string;
} {
  const native = nativeProvider(model.provider);
  const usesOpenAIEnv = model.provider === "openai" || model.provider === "openai-compatible";
  return {
    apiKeyEnv:
      model.apiKeyEnv ??
      native?.apiKeyEnv ??
      (model.provider === "openai-compatible" ? "OPENAI_API_KEY" : undefined),
    baseURL:
      model.baseURL ??
      (usesOpenAIEnv ? process.env.OPENAI_BASE_URL : undefined) ??
      native?.baseURL ??
      OPENAI_URL,
  };
}
