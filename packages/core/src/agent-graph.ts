import type { LoadedProject } from "@plico-ai/contracts";
import type { AgentDefinition } from "./agents.js";
import { getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

export const DELEGATE_TOOL_PREFIX = "delegate_";

/** The synthetic tool a supervisor calls to delegate to `agentId`. */
export function delegateToolName(agentId: string): string {
  return `${DELEGATE_TOOL_PREFIX}${agentId}`;
}

/** Project tool names as the model sees them: tool files plus MCP allowlists. */
export function projectToolNames(project: LoadedProject, fileTools: string[]): string[] {
  const mcp = Object.entries(project.config.mcpServers ?? {}).flatMap(([serverId, server]) =>
    server.tools.map(
      (tool) => `mcp_${serverId}__${tool.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`,
    ),
  );
  return [...fileTools, ...mcp];
}

interface GraphInput {
  project: LoadedProject;
  agents: AgentDefinition[];
  tools: string[];
  skills: string[];
  workflows: string[];
}

/** References, descriptions, collisions, cycles, model and artifact rules across all agents. */
export function validateAgentGraph({
  project,
  agents,
  tools,
  skills,
  workflows,
}: GraphInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const error = (path: string, message: string) =>
    issues.push({ path, message, severity: "error" });
  const projectAccess = project.config.artifacts?.access ?? "read-write";
  const order = ["read-write", "read-only", "off"];

  for (const agent of agents) {
    for (const name of agent.tools ?? [])
      if (!tools.includes(name)) error(agent.source, `Unknown tool "${name}" in tools`);
    for (const name of agent.skills ?? [])
      if (!skills.includes(name)) error(agent.source, `Unknown skill "${name}" in skills`);
    for (const id of agent.agents) {
      const target = byId.get(id);
      if (!target) {
        error(agent.source, `Unknown agent "${id}" in agents`);
        continue;
      }
      if (!target.description)
        error(
          target.source,
          `${id} needs a description, because ${agent.id} delegates to it. Add "description: <when to use ${id}>" to its frontmatter.`,
        );
      const tool = delegateToolName(id);
      if (tools.includes(tool))
        error(agent.source, `${tool} collides with the project tool of the same name. Rename one.`);
    }
    if (agent.artifacts && order.indexOf(agent.artifacts) < order.indexOf(projectAccess))
      error(
        agent.source,
        `artifacts can only narrow the project's access ("${projectAccess}"), not widen it to "${agent.artifacts}".`,
      );
    if (agent.model) {
      const merged = { ...project.config.model, ...agent.model };
      if (typeof merged.provider !== "string" || !merged.provider.trim())
        error(
          agent.source,
          "model needs a provider: set model.provider here or in plico.config.ts.",
        );
      if (typeof merged.name !== "string" || !merged.name.trim())
        error(agent.source, "model needs a name: set model.name here or in plico.config.ts.");
    }
  }

  for (const id of workflows)
    if (byId.has(id))
      error(`workflows/${id}.ts`, `ID "${id}" is used by both an agent and a workflow.`);

  const cycle = findCycle(agents, byId);
  if (cycle) {
    const first = byId.get(cycle[0] ?? "");
    error(
      first?.source ?? "agents",
      `Delegation cycle: ${cycle.join(" -> ")}. Delegation cannot recurse.`,
    );
  }

  const entry = project.config.entry;
  if (entry !== undefined && !byId.has(entry) && !workflows.includes(entry))
    error(getProjectRelativePaths().configFile, `entry "${entry}" is not an agent or workflow.`);
  return issues;
}

function findCycle(
  agents: AgentDefinition[],
  byId: Map<string, AgentDefinition>,
): string[] | undefined {
  const done = new Set<string>();
  const visit = (id: string, path: string[]): string[] | undefined => {
    const start = path.indexOf(id);
    if (start !== -1) return [...path.slice(start), id];
    if (done.has(id)) return undefined;
    for (const next of byId.get(id)?.agents ?? []) {
      if (!byId.has(next)) continue;
      const found = visit(next, [...path, id]);
      if (found) return found;
    }
    done.add(id);
    return undefined;
  };
  for (const agent of agents) {
    const found = visit(agent.id, []);
    if (found) return found;
  }
  return undefined;
}
