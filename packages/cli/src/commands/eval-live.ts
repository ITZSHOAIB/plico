import { type ProjectConfig, validateProject } from "@plico-ai/core";
import { type LiveEvalOptions, loadProjectEnv, modelProviderRecoveryKey } from "@plico-ai/runtime";
import { type ParsedArgs, readStringOption } from "../args.js";
import { resolveModelProvider } from "./model-provider.js";

export const LIVE_FLAGS = ["--live", "--mock-tools"] as const;
export const LIVE_VALUES: Record<string, { missing: string }> = {
  "--model": { missing: "Missing provider:model after --model" },
  "--max-tokens": { missing: "Missing token count after --max-tokens" },
  "--concurrency": { missing: "Missing run count after --concurrency" },
};

type ModelConfig = NonNullable<ProjectConfig["model"]>;

function positiveInteger(parsed: ParsedArgs, flag: string): number | undefined {
  const raw = readStringOption(parsed, flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${flag} takes a whole number above 0, not "${raw}".`);
  return value;
}

/** `--model provider:model` replaces the agent's model; endpoint settings carry over only within a provider. */
function overrideModel(model: ModelConfig | undefined, override: string): ModelConfig {
  const colon = override.indexOf(":");
  if (colon <= 0 || colon === override.length - 1)
    throw new Error(`--model takes provider:model, such as openai:gpt-5-mini, not "${override}".`);
  const provider = override.slice(0, colon);
  const name = override.slice(colon + 1);
  if (model?.provider === provider) return { ...model, name };
  const { maxSteps, retries, retryDelayMs } = model ?? {};
  return {
    provider,
    name,
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(retries === undefined ? {} : { retries }),
    ...(retryDelayMs === undefined ? {} : { retryDelayMs }),
  };
}

/** The live options `plico eval` was given, or undefined for a scripted run. */
export async function readLiveOptions(
  parsed: ParsedArgs,
  target: string,
): Promise<LiveEvalOptions | undefined> {
  if (!parsed.flags.has("--live")) {
    const stray = ["--mock-tools", ...Object.keys(LIVE_VALUES)].find(
      (flag) => parsed.flags.has(flag) || readStringOption(parsed, flag) !== undefined,
    );
    if (stray) throw new Error(`${stray} requires --live.`);
    return undefined;
  }

  loadProjectEnv(target);
  const validation = await validateProject(target);
  if (!validation.ok || !validation.project)
    throw new Error("Project is invalid. Run plico validate for details.");
  const override = readStringOption(parsed, "--model");
  const configured = validation.project.config.model;
  const model = override === undefined ? configured : overrideModel(configured, override);
  const maxTokens = positiveInteger(parsed, "--max-tokens");
  const concurrency = positiveInteger(parsed, "--concurrency");
  return {
    provider: resolveModelProvider(model, target),
    ...(model ? { providerRecoveryKey: modelProviderRecoveryKey(model) } : {}),
    ...(parsed.flags.has("--mock-tools") ? { mockTools: true } : {}),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(concurrency === undefined ? {} : { concurrency }),
  };
}
