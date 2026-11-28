import type { LoadedProject } from "@plico-ai/core";
import { readAgents, resolveAgentModel } from "@plico-ai/core";
import { resolveModelEndpoint } from "../../providers/registry.js";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

/** An agent can override the project model, so each credential variable it needs must be set too. */
export async function checkAgentProviders(project: LoadedProject): Promise<ReadinessDiagnostic[]> {
  const { agents } = await readAgents(project.root);
  const checked = new Set<string>();
  const projectModel = project.config.model;
  if (projectModel) checked.add(resolveModelEndpoint(projectModel).apiKeyEnv ?? "");
  const diagnostics: ReadinessDiagnostic[] = [];
  for (const agent of agents) {
    const model = agent.model ? resolveAgentModel(projectModel, agent.model) : undefined;
    if (!model || model === projectModel) continue;
    const { apiKeyEnv } = resolveModelEndpoint(model);
    if (!apiKeyEnv || checked.has(apiKeyEnv)) continue;
    checked.add(apiKeyEnv);
    if (!process.env[apiKeyEnv])
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "provider.credentials",
          `Set ${apiKeyEnv} to run the model of agent "${agent.id}".`,
          agent.source,
        ),
      );
  }
  return diagnostics;
}
