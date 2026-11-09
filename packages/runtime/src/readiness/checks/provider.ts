import type { ProjectConfig, ReadinessDiagnostic } from "@plico/contracts";
import { resolveModelEndpoint } from "../../providers/registry.js";
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
  const { apiKeyEnv } = resolveModelEndpoint(model);
  if (!apiKeyEnv)
    return [
      makeDiagnostic(
        "ok",
        "provider.credentials",
        "The project supplies its own provider credentials.",
      ),
    ];
  if (!process.env[apiKeyEnv])
    return [
      makeDiagnostic(
        "warning",
        "provider.credentials",
        `Set ${apiKeyEnv} to run the configured model.`,
      ),
    ];
  return [
    makeDiagnostic("ok", "provider.credentials", "Model provider credentials are configured."),
  ];
}
