import type { ProjectConfig, ReadinessDiagnostic } from "@plico/contracts";
import { makeDiagnostic } from "../diagnostic.js";

export function checkProvider(model: ProjectConfig["model"]): ReadinessDiagnostic[] {
  if (!model)
    return [
      makeDiagnostic(
        "warning",
        "provider.config",
        "No model configured. Add model settings for real provider runs.",
        "plico.config.ts",
      ),
    ];
  if (model.provider !== "openai-compatible" && model.provider !== "openai")
    return [
      makeDiagnostic(
        "warning",
        "provider.config",
        `Provider ${model.provider} is not supported by the available adapter.`,
        "plico.config.ts",
      ),
    ];
  if (!process.env.OPENAI_API_KEY)
    return [
      makeDiagnostic(
        "warning",
        "provider.credentials",
        "Set OPENAI_API_KEY to run the configured model.",
      ),
    ];
  return [
    makeDiagnostic("ok", "provider.credentials", "Model provider credentials are configured."),
  ];
}
