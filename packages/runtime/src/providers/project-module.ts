import { pathToFileURL } from "node:url";
import type { ProviderInput } from "@plico/contracts";
import { findProjectProviderFile } from "@plico/core";
import type { LanguageModel } from "ai";
import { register } from "tsx/esm/api";
import type { ModelProvider } from "../types/index.js";
import { createAiSdkModelProvider } from "./ai-sdk.js";

let registered = false;

/** A provider the project supplies in `providers/<name>.ts`, run behind the Plico model port. */
export function createProjectModuleProvider(
  root: string,
  provider: string,
  input: { model: string; apiKeyEnv: string | undefined; baseURL?: string },
): ModelProvider {
  return createAiSdkModelProvider({
    apiKeyEnv: input.apiKeyEnv,
    createModel: async (apiKey): Promise<LanguageModel> => {
      const file = await findProjectProviderFile(root, provider);
      if (!file) throw new Error(`Missing model provider module: providers/${provider}.ts`);
      if (!registered) {
        register();
        registered = true;
      }
      const loaded = (await import(pathToFileURL(file).href)) as { default?: unknown };
      if (typeof loaded.default !== "function")
        throw new Error(`providers/${provider} must export a function by default.`);
      const options: ProviderInput = {
        model: input.model,
        ...(apiKey ? { apiKey } : {}),
        ...(input.baseURL ? { baseURL: input.baseURL } : {}),
      };
      return (await loaded.default(options)) as LanguageModel;
    },
  });
}
