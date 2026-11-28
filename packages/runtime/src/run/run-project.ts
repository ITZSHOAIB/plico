import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { type Span, SpanStatusCode } from "@opentelemetry/api";
import {
  type AgentDefinition,
  getProjectRelativePaths,
  type LoadedProject,
  MAIN_AGENT_ID,
  type RunTarget,
  readAgents,
  resolveRunTarget,
  validateProject,
} from "@plico-ai/core";
import {
  createEngine,
  createMemoryJournal,
  RunCancelled,
  type RunContext,
} from "../engine/index.js";
import { RunWaitingError, runtimeErrorPayload } from "../errors.js";
import { InMemoryEventLog } from "../events.js";
import type { RunProjectOptions, RunResult } from "../types/index.js";
import { executeAgent } from "./agents/run-agent.js";
import { observe, type RunTree } from "./agents/tree.js";
import { finalizeRun } from "./finalize.js";
import { ignoredWhenPinned } from "./pinned-instructions.js";
import type { RunInput } from "./run-input.js";
import { startRunSpan, storeSpanContext } from "./tracing.js";
import { runWorkflow } from "./workflows/run-workflow.js";

export async function runProject(
  root: string,
  options: RunProjectOptions = {},
): Promise<RunResult> {
  const engine = options.engine ?? createEngine({ journal: createMemoryJournal() });
  const runId = options.runId ?? `run-${randomUUID()}`;
  const span = startRunSpan(runId);
  const input: RunInput = {
    root: resolve(root),
    displayRoot: root,
    startedAt: new Date().toISOString(),
    traceContext: storeSpanContext(span),
    recordsTarget: true,
    ...(options.agent === undefined ? {} : { agent: options.agent }),
    ...(options.workflow === undefined ? {} : { workflow: options.workflow }),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.message === undefined ? {} : { message: options.message }),
    ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    ...(options.context === undefined ? {} : { context: options.context }),
    ...(options.history === undefined ? {} : { history: options.history }),
    ...(options.script === undefined ? {} : { script: options.script }),
    // Always recorded for a script, so recovery can tell a run that may call handlers from one
    // journaled before this flag existed.
    ...(options.script !== undefined || options.mockTools === true
      ? { mockTools: options.mockTools === true }
      : {}),
    ...(options.providerRecoveryKey === undefined
      ? {}
      : { providerRecoveryKey: options.providerRecoveryKey }),
  };

  let firstExecution = true;

  const outcome = await engine
    .run(
      runId,
      async (ctx, journaled: RunInput) => {
        const executionSpan = firstExecution
          ? span
          : startRunSpan(ctx.runId, journaled.traceContext);
        firstExecution = false;
        try {
          const result = await runLoop(ctx, journaled, options, executionSpan);
          if (result.status === "failed") executionSpan.setStatus({ code: SpanStatusCode.ERROR });
          return result;
        } catch (error) {
          executionSpan.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          executionSpan.end();
        }
      },
      input,
    )
    .finally(() => span.end());
  if (outcome.output === undefined) throw new Error(`Run ${runId} stopped without a result.`);
  return outcome.output;
}

export async function runLoop(
  ctx: RunContext,
  input: RunInput,
  options: RunProjectOptions,
  span: Span,
): Promise<RunResult> {
  const { runId } = ctx;
  const { root, startedAt } = input;
  const displayRoot = input.displayRoot ?? root;
  const validation = await validateProject(root);
  const events = await InMemoryEventLog.open(runId, options.eventStore);
  const observed: RunTree["observed"] = [];
  observe({ observed }, events);
  const pinned = events.all().some((event) => event.type === "instructions.composed");
  const target = await recordTarget(ctx, input, validation.project);
  const errors = [
    ...(pinned
      ? validation.errors.filter((issue) => !ignoredWhenPinned(issue))
      : validation.errors),
    ...(target.kind === "invalid"
      ? [
          {
            path: getProjectRelativePaths().configFile,
            message: target.message,
            severity: "error" as const,
          },
        ]
      : []),
  ];
  const newlyStarted = events.all().length === 0;
  await events.append("run.started", {
    projectRoot: displayRoot,
    projectName: validation.project?.config.name ?? "",
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(target.kind === "resolved"
      ? { [target.run.kind === "agent" ? "agentId" : "workflowId"]: target.run.id }
      : {}),
  });
  if (newlyStarted) options.onStarted?.(runId);

  if (errors.length > 0 || !validation.project || target.kind === "invalid") {
    await events.append("run.error", { phase: "validation", issues: errors });
    await events.append("run.failed", { phase: "validation" });

    return finalizeRun({
      runId,
      projectRoot: displayRoot,
      projectName: "",
      status: "failed",
      startedAt,
      events: events.all(),
      errors,
      eventStore: options.eventStore,
    });
  }

  const { project } = validation;
  const summary = {
    runId,
    projectRoot: displayRoot,
    projectName: project.config.name,
    startedAt,
    eventStore: options.eventStore,
  };

  try {
    const tree: RunTree = {
      rootRunId: runId,
      input,
      options,
      project,
      agents: new Map((await readAgents(project.root)).agents.map((agent) => [agent.id, agent])),
      observed,
    };
    const selected =
      target.kind === "resolved" ? target.run : { kind: "agent" as const, id: MAIN_AGENT_ID };
    const output =
      selected.kind === "workflow"
        ? await runWorkflow(ctx, tree, selected.id, events)
        : await executeAgent(ctx, span, tree, rootAgent(tree, selected.id), events, {
            message: input.message,
            history: input.history,
            script: input.script,
          });
    await events.append("run.completed", output);

    return await finalizeRun({
      ...summary,
      status: "completed",
      ...output,
      events: events.all(),
    });
  } catch (error) {
    if (error instanceof RunWaitingError) {
      return finalizeRun({
        ...summary,
        status: "waiting",
        output: error.output,
        events: events.all(),
      });
    }

    if (error instanceof RunCancelled || ctx.signal.aborted) {
      await events.append("run.cancelled", {});
      return finalizeRun({ ...summary, status: "cancelled", events: events.all() });
    }

    await events.append("run.error", runtimeErrorPayload(error));
    await events.append("run.failed", { phase: "runtime" });

    return finalizeRun({ ...summary, status: "failed", events: events.all() });
  }
}

/** `legacy` runs were journaled before targets were recorded and run `main`. */
type TargetOutcome =
  | { kind: "resolved"; run: RunTarget }
  | { kind: "invalid"; message: string }
  | { kind: "legacy" };

/**
 * The agent or workflow this run executes, journaled so a changed `entry` cannot reroute a run that
 * resumes. Runs journaled before named agents have no target step and run `main`.
 */
async function recordTarget(
  ctx: RunContext,
  input: RunInput,
  project: LoadedProject | undefined,
): Promise<TargetOutcome> {
  if (input.recordsTarget !== true) return { kind: "legacy" };
  // The journaled shape is `RunTarget | { error }`; it stays as is so journaled runs still resume.
  const journaled = await ctx.step<RunTarget | { error: string }>("target", async () => {
    if (!project) return { kind: "agent" as const, id: MAIN_AGENT_ID };
    try {
      return await resolveRunTarget(project, { agent: input.agent, workflow: input.workflow });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  return "error" in journaled
    ? { kind: "invalid", message: journaled.error }
    : { kind: "resolved", run: journaled };
}

function rootAgent(tree: RunTree, id: string): AgentDefinition {
  const agent = tree.agents.get(id);
  if (!agent) throw new Error(`Unknown agent "${id}".`);
  return agent;
}
