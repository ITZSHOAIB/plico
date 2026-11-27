import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowDefinition } from "@plico-ai/contracts";
import { AGENT_ID_PATTERN } from "./agents.js";
import { importProjectModule } from "./config.js";
import { validateRunSchemas } from "./run-schemas.js";
import type { ValidationIssue } from "./types.js";

export const WORKFLOWS_DIRECTORY = "workflows";
export const DEFAULT_MAX_AGENT_CALLS = 20;

export interface WorkflowFile {
  id: string;
  /** Project-relative path, `workflows/<id>.ts`. */
  source: string;
  file: string;
}

export interface LoadedWorkflow extends WorkflowFile {
  definition: WorkflowDefinition;
  maxAgentCalls: number;
}

/** Every `workflows/<id>.ts`, sorted by ID. Test and declaration files are skipped. */
export async function listWorkflowFiles(root: string): Promise<WorkflowFile[]> {
  const directory = join(root, WORKFLOWS_DIRECTORY);
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".d.ts") &&
          !entry.name.endsWith(".test.ts"),
      )
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
  return names.map((name) => ({
    id: name.slice(0, -".ts".length),
    source: `${WORKFLOWS_DIRECTORY}/${name}`,
    file: join(directory, name),
  }));
}

/** Imports a workflow file and checks its default export. Throws with a readable message. */
export async function loadWorkflow(workflow: WorkflowFile): Promise<LoadedWorkflow> {
  let module: unknown;
  try {
    module = await importProjectModule(workflow.file);
  } catch (error) {
    throw new Error(
      `Failed to load ${workflow.source}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const definition = unwrap((module as { default?: unknown } | undefined)?.default);
  const problem = shapeProblem(definition);
  if (problem) throw new Error(`${workflow.source}: ${problem}`);
  const typed = definition as WorkflowDefinition;
  return {
    ...workflow,
    definition: typed,
    maxAgentCalls: typed.maxAgentCalls ?? DEFAULT_MAX_AGENT_CALLS,
  };
}

function unwrap(value: unknown): unknown {
  let current = value;
  while (
    typeof current === "object" &&
    current !== null &&
    Object.keys(current).length === 1 &&
    "default" in current
  )
    current = (current as { default: unknown }).default;
  return current;
}

function shapeProblem(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "default export must be an object with a run function";
  const definition = value as Record<string, unknown>;
  if (typeof definition.run !== "function")
    return "default export needs a run({ input, agent, step }) function";
  if (definition.description !== undefined && typeof definition.description !== "string")
    return "description must be text";
  if (
    definition.maxAgentCalls !== undefined &&
    (!Number.isSafeInteger(definition.maxAgentCalls) || Number(definition.maxAgentCalls) <= 0)
  )
    return "maxAgentCalls must be a positive integer";
  return undefined;
}

/** Agent IDs a workflow calls with a literal ID, such as `agent("reviewer", ...)`. */
export function staticAgentCalls(source: string): string[] {
  const calls = new Set<string>();
  for (const match of source.matchAll(/\bagent\(\s*(["'`])([^"'`$\\]+)\1/g))
    if (match[2]) calls.add(match[2]);
  return [...calls];
}

/** Load errors, shape errors, schema errors and unknown agent IDs for every workflow file. */
export async function validateWorkflows(
  workflows: WorkflowFile[],
  agentIds: string[],
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const workflow of workflows) {
    const error = (message: string) =>
      issues.push({ path: workflow.source, message, severity: "error" });
    if (!AGENT_ID_PATTERN.test(workflow.id)) {
      error(
        `Workflow ID "${workflow.id}" must start with a lowercase letter and use only lowercase letters, digits, "-" and "_".`,
      );
      continue;
    }
    try {
      const loaded = await loadWorkflow(workflow);
      issues.push(
        ...(await validateRunSchemas(workflow.source, workflow.file, loaded.definition as never)),
      );
    } catch (cause) {
      error(cause instanceof Error ? cause.message : String(cause));
      continue;
    }
    for (const id of staticAgentCalls(await readFile(workflow.file, "utf8")))
      if (!agentIds.includes(id)) error(`Unknown agent "${id}" in agent() call`);
  }
  return issues;
}
