import type { PlicoEvent } from "@plico-ai/contracts";
import { type AgentDefinition, type LoadedProject, resolveAgentModel } from "@plico-ai/core";
import type { InMemoryEventLog } from "../../events.js";
import type { ModelProvider, RunProjectOptions } from "../../types/index.js";
import type { RunInput } from "../run-input.js";
import type { ToolScope } from "./types.js";

/** What every run in one engine run shares: the root, its project, and the events reached so far. */
export interface RunTree {
  rootRunId: string;
  input: RunInput;
  options: RunProjectOptions;
  project: LoadedProject;
  agents: Map<string, AgentDefinition>;
  /** Every event any run in the tree reached, in order, so artifact versions replay the same. */
  observed: PlicoEvent[];
  /**
   * Set when a child stopped to wait or was cancelled. A workflow that catches that error must
   * not carry on, because the next execution would take a different path.
   */
  halted?: unknown;
  threadHistory?: Promise<PlicoEvent[]>;
}

/** True for the root run and for every child run under it. */
export function inTree(rootRunId: string, runId: string): boolean {
  return runId === rootRunId || runId.startsWith(`${rootRunId}.`);
}

/** Feeds the tree's history from a run's log. Register before the run's first append. */
export function observe(tree: RunTree, events: InMemoryEventLog): void {
  events.onEvent((event) => {
    tree.observed.push(event);
  });
}

/**
 * Copies a child's approval events to its parent with the child's `runId`, so a host that reads the
 * root sees every pending approval. The parent is blocked on the child, so the copies land at the
 * same place on every execution.
 */
export function relayApprovals(child: InMemoryEventLog, parent: InMemoryEventLog): void {
  child.onEvent(async (event) => {
    if (
      event.type !== "approval.requested" &&
      event.type !== "approval.decided" &&
      event.type !== "run.waiting"
    )
      return;
    await parent.append(event.type, {
      ...event.payload,
      runId: event.payload.runId ?? event.runId,
    } as never);
  });
}

export function treeScope(tree: RunTree): ToolScope {
  const { threadId, context } = tree.input;
  return {
    workspaceRunId: tree.rootRunId,
    threadId,
    context,
    history: async () => {
      const store = tree.options.eventStore;
      tree.threadHistory ??=
        threadId && store?.getThreadRunEvents
          ? store
              .getThreadRunEvents(threadId)
              .then((events) => events.filter((event) => !inTree(tree.rootRunId, event.runId)))
          : Promise.resolve([]);
      return [...(await tree.threadHistory), ...tree.observed];
    },
  };
}

/** The agent's model, with its overrides applied, and the provider that serves it. */
export function agentModel(
  tree: RunTree,
  agent: AgentDefinition,
): { model: LoadedProject["config"]["model"]; provider: ModelProvider | undefined } {
  const model = resolveAgentModel(tree.project.config.model, agent.model);
  const provider =
    agent.model && model && tree.options.providerForModel
      ? (tree.options.providerForModel(model) ?? tree.options.provider)
      : tree.options.provider;
  return { model, provider };
}
