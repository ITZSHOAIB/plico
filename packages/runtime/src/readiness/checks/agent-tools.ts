import type { LoadedProject } from "@plico-ai/core";
import { readAgents } from "@plico-ai/core";
import { decideApproval } from "../../policy/approval.js";
import type { DeclaredTool, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

/**
 * A specialist without a `tools` list inherits every project tool. When one of those needs approval,
 * a delegation can stop the whole run on a tool the supervisor never meant to hand over. A
 * supervisor that inherits tools can call them directly instead of delegating.
 */
export async function checkAgentTools(
  project: LoadedProject,
  tools: DeclaredTool[],
): Promise<ReadinessDiagnostic[]> {
  const { agents } = await readAgents(project.root);
  const delegated = new Set(agents.flatMap((agent) => agent.agents));
  const gated = tools
    .filter((tool) => decideApproval(tool, project.config).required)
    .map((tool) => tool.name);
  const diagnostics: ReadinessDiagnostic[] = [];
  for (const agent of agents) {
    if (agent.tools !== undefined) continue;
    if (agent.agents.length > 0 && tools.length > 0)
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "agents.tools",
          `Agent "${agent.id}" delegates and inherits every project tool, so it can call them directly instead of delegating. Set tools: [] or the few it needs in ${agent.source}.`,
          agent.source,
        ),
      );
    if (delegated.has(agent.id) && gated.length > 0)
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "agents.tools",
          `Agent "${agent.id}" is delegated to and inherits every project tool, including ${gated.map((name) => `"${name}"`).join(", ")}, which need approval. List the tools it needs with tools: [...] in ${agent.source}.`,
          agent.source,
        ),
      );
  }
  return diagnostics;
}
