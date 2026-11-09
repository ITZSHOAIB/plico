import type { ProjectConfig } from "@plico/core";
import { createConfiguredModelProvider, type ModelProvider } from "@plico/runtime";

export function resolveModelProvider(
  model: ProjectConfig["model"],
  projectRoot: string,
): ModelProvider {
  if (!model) throw new Error("Model configuration is missing from plico.config.ts.");
  const provider = createConfiguredModelProvider(model, projectRoot);
  if (!provider) throw new Error(`Unsupported model provider: ${model.provider}`);
  return provider;
}

export async function resolveMessage(message: string | undefined): Promise<string> {
  if (message?.trim()) return message;
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += String(chunk);
    if (input.trim()) return input;
  }
  throw new Error("A user message is required. Provide --message or pipe input via stdin.");
}
