import { createHash } from "node:crypto";
import type { ProjectConfig } from "@plico/contracts";
import { NATIVE_MODEL_PROVIDERS } from "@plico/core";
import type { LanguageModel } from "ai";
import type { ModelProvider } from "../types/index.js";
import { createAiSdkModelProvider } from "./ai-sdk.js";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import { createProjectModuleProvider } from "./project-module.js";
import { nativeProvider, resolveModelEndpoint } from "./registry.js";

type ModelConfig = NonNullable<ProjectConfig["model"]>;

export function supportsModelProvider(provider: string): boolean {
  return NATIVE_MODEL_PROVIDERS.includes(provider);
}

/**
 * The model port for a project's configured model. A provider outside the native list comes from
 * `providers/<name>.ts` and needs the project root; without it there is no adapter.
 */
export function createConfiguredModelProvider(
  model: ModelConfig,
  projectRoot?: string,
): ModelProvider | undefined {
  const { apiKeyEnv, baseURL } = resolveModelEndpoint(model);
  const native = nativeProvider(model.provider);
  if (native)
    return createAiSdkModelProvider({
      apiKeyEnv,
      createModel: async (apiKey) =>
        (await native.create({
          model: model.name,
          apiKey: apiKey ?? "",
          baseURL,
        })) as LanguageModel,
    });
  if (model.provider === "openai-compatible")
    return createOpenAICompatibleProvider({
      model: model.name,
      baseURL,
      ...(apiKeyEnv ? { apiKeyEnv } : {}),
    });
  if (!projectRoot) return undefined;
  return createProjectModuleProvider(projectRoot, model.provider, {
    model: model.name,
    apiKeyEnv,
    ...(model.baseURL ? { baseURL: model.baseURL } : {}),
  });
}

function hashParts(parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Hash the provider target and credential without storing either secret in the journal. */
export function modelProviderRecoveryKey(model: ModelConfig): string {
  const { apiKeyEnv, baseURL } = resolveModelEndpoint(model);
  return hashParts([
    model.provider,
    model.name,
    baseURL,
    (apiKeyEnv ? process.env[apiKeyEnv] : "") ?? "",
  ]);
}

/**
 * Hash only the account and credential. A queued run has not called a model yet, so changing the
 * configured model must not strand its reservation.
 */
export function modelProviderAccountKey(model: ModelConfig): string {
  const { apiKeyEnv, baseURL } = resolveModelEndpoint(model);
  return hashParts([model.provider, baseURL, (apiKeyEnv ? process.env[apiKeyEnv] : "") ?? ""]);
}
