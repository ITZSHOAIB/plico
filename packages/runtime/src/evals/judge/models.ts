import type { ProjectConfig } from "@plico-ai/contracts";
import { parseModelRef } from "@plico-ai/core";
import { createConfiguredModelProvider } from "../../providers/configured.js";
import type { ModelProvider } from "../../types/index.js";

type ModelConfig = NonNullable<ProjectConfig["model"]>;

/**
 * The model a `provider:model` reference names, based on the configured one. Endpoint settings
 * carry over only within the same provider; a different provider keeps only the run limits.
 */
export function modelFromRef(ref: string, model: ModelConfig | undefined): ModelConfig | undefined {
  const parsed = parseModelRef(ref);
  if (!parsed) return undefined;
  if (model?.provider === parsed.provider) return { ...model, name: parsed.name };
  const { maxSteps, retries, retryDelayMs } = model ?? {};
  return {
    ...parsed,
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(retries === undefined ? {} : { retries }),
    ...(retryDelayMs === undefined ? {} : { retryDelayMs }),
  };
}

/** The suite's default judge: `evals.judge`, else the configured model. Never `--model`. */
export function configuredJudge(config: ProjectConfig): string | undefined {
  return config.evals?.judge ?? (config.model && `${config.model.provider}:${config.model.name}`);
}

/** One provider per judge model, built from `plico.config.ts`. */
export function configuredJudgeProviders(
  config: ProjectConfig,
  projectRoot: string,
): (ref: string) => ModelProvider {
  const built = new Map<string, ModelProvider>();
  return (ref) => {
    let provider = built.get(ref);
    if (!provider) {
      const model = modelFromRef(ref, config.model);
      provider = model && createConfiguredModelProvider(model, projectRoot);
      if (!provider) throw new Error(`Unsupported model provider in ${ref}.`);
      built.set(ref, provider);
    }
    return provider;
  };
}
