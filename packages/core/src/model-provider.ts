import { access } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig, ValidationIssue } from "./types.js";

/** Providers Plico ships adapters for. Anything else comes from `providers/<name>.ts`. */
export const NATIVE_MODEL_PROVIDERS: readonly string[] = [
  "anthropic",
  "google",
  "openai",
  "openai-compatible",
];

const PROVIDER_EXTENSIONS = [".ts", ".mts", ".js", ".mjs"];

/** The file in `providers/` that supplies `provider`, or `undefined` when there is none. */
export async function findProjectProviderFile(
  root: string,
  provider: string,
): Promise<string | undefined> {
  if (!/^[\w-]+$/.test(provider)) return undefined;
  for (const extension of PROVIDER_EXTENSIONS) {
    const file = join(root, "providers", `${provider}${extension}`);
    try {
      await access(file);
      return file;
    } catch {}
  }
  return undefined;
}

/** `plico validate` fails on a provider that is neither native nor supplied by the project. */
export async function validateModelProvider(
  root: string,
  model: ProjectConfig["model"],
  configPath: string,
): Promise<ValidationIssue[]> {
  if (!model || NATIVE_MODEL_PROVIDERS.includes(model.provider)) return [];
  if (await findProjectProviderFile(root, model.provider)) return [];
  return [
    {
      path: configPath,
      message: `Unknown model provider "${model.provider}". Use ${NATIVE_MODEL_PROVIDERS.join(", ")}, or add providers/${model.provider}.ts.`,
      severity: "error",
    },
  ];
}
