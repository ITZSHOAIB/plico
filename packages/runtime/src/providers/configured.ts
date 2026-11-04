import { createHash } from "node:crypto";
import type { ProjectConfig } from "@plico/contracts";
import type { ModelProvider } from "../types/index.js";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";

type ModelConfig = NonNullable<ProjectConfig["model"]>;

export function supportsModelProvider(provider: string): boolean {
  return provider === "openai" || provider === "openai-compatible";
}

export function createConfiguredModelProvider(model: ModelConfig): ModelProvider | undefined {
  if (!supportsModelProvider(model.provider)) return undefined;
  return createOpenAICompatibleProvider({
    model: model.name,
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  });
}

/** Hash the provider target and credential without storing either secret in the journal. */
export function modelProviderRecoveryKey(model: ModelConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        model.provider,
        model.name,
        process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
        process.env.OPENAI_API_KEY ?? "",
      ]),
    )
    .digest("hex");
}

/**
 * Hash only the account and credential. A queued run has not called a model yet, so changing the
 * configured model must not strand its reservation.
 */
export function modelProviderAccountKey(model: ModelConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        model.provider,
        process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
        process.env.OPENAI_API_KEY ?? "",
      ]),
    )
    .digest("hex");
}
