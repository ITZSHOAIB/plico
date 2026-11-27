import { type AgentDefinition, MAIN_AGENT_ID, readAgents } from "./agents.js";
import { type RUN_SCHEMA_KEYS, readRunSchemas } from "./run-schemas.js";
import { type NormalizedInputSchema, normalizeInputSchema } from "./schema.js";
import type { LoadedProject } from "./types.js";
import { type LoadedWorkflow, listWorkflowFiles, loadWorkflow } from "./workflows.js";

/** What a run executes: one agent, or a workflow. */
export type RunTarget = { kind: "agent"; id: string } | { kind: "workflow"; id: string };

export interface RunSelection {
  agent?: string | undefined;
  workflow?: string | undefined;
}

type TargetSchemas = Partial<Record<(typeof RUN_SCHEMA_KEYS)[number], NormalizedInputSchema>>;

/**
 * The agent or workflow a run starts. An explicit selection wins, then `entry` in
 * `plico.config.ts`, then `main`. Throws with a readable message for an unknown ID.
 */
export async function resolveRunTarget(
  project: LoadedProject,
  selection: RunSelection = {},
): Promise<RunTarget> {
  if (selection.agent !== undefined && selection.workflow !== undefined)
    throw new Error("Select an agent or a workflow, not both.");
  const agents = (await readAgents(project.root)).agents.map((agent) => agent.id);
  const workflows = (await listWorkflowFiles(project.root)).map((workflow) => workflow.id);
  if (selection.agent !== undefined) {
    if (!agents.includes(selection.agent))
      throw new Error(`Unknown agent "${selection.agent}". Agents: ${agents.join(", ")}.`);
    return { kind: "agent", id: selection.agent };
  }
  if (selection.workflow !== undefined) {
    if (!workflows.includes(selection.workflow))
      throw new Error(
        `Unknown workflow "${selection.workflow}". Workflows: ${workflows.join(", ") || "none"}.`,
      );
    return { kind: "workflow", id: selection.workflow };
  }
  const entry = project.config.entry ?? MAIN_AGENT_ID;
  if (workflows.includes(entry) && !agents.includes(entry)) return { kind: "workflow", id: entry };
  return { kind: "agent", id: entry };
}

/** The named agent, or throws. */
export async function readAgent(project: LoadedProject, id: string): Promise<AgentDefinition> {
  const agent = (await readAgents(project.root)).agents.find((candidate) => candidate.id === id);
  if (!agent) throw new Error(`Unknown agent "${id}".`);
  return agent;
}

/** The named workflow, loaded, or throws. */
export async function readWorkflow(project: LoadedProject, id: string): Promise<LoadedWorkflow> {
  const file = (await listWorkflowFiles(project.root)).find((workflow) => workflow.id === id);
  if (!file) throw new Error(`Unknown workflow "${id}".`);
  return loadWorkflow(file);
}

/**
 * The input and output schemas of a run target. `main` keeps its `plico.config.ts` fallback; a
 * named agent or workflow declares its own.
 */
export async function readTargetSchemas(
  project: LoadedProject,
  target: RunTarget,
): Promise<TargetSchemas> {
  if (target.kind === "agent" && target.id === MAIN_AGENT_ID) return readRunSchemas(project);
  const { declared, file } =
    target.kind === "agent"
      ? await readAgent(project, target.id).then((agent) => ({ declared: agent, file: agent.file }))
      : await readWorkflow(project, target.id).then((workflow) => ({
          declared: workflow.definition,
          file: workflow.file,
        }));
  const schemas: TargetSchemas = {};
  for (const key of ["input", "output"] as const) {
    const value = declared[key];
    if (value !== undefined) schemas[key] = await normalizeInputSchema(value, key, file);
  }
  return schemas;
}
