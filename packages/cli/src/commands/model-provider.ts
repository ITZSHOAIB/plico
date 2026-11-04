import { validateProject } from "@plico/core";
import { createOpenAICompatibleProvider, type ModelProvider } from "@plico/runtime";

export async function resolveModelProvider(root: string): Promise<ModelProvider> {
  const validation = await validateProject(root);
  if (!validation.ok || !validation.project)
    throw new Error("Project is invalid. Run plico validate for details.");
  const model = validation.project.config.model;
  if (!model) throw new Error("Model configuration is missing from plico.config.ts.");
  if (model.provider !== "openai" && model.provider !== "openai-compatible")
    throw new Error(`Unsupported model provider: ${model.provider}`);
  return createOpenAICompatibleProvider({
    model: model.name,
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  });
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
