import { randomUUID } from "node:crypto";
import { validateProject } from "@plico/core";
import {
  createEngine,
  createMemoryJournal,
  type Engine,
  type RecoveredRun,
  type RunContext,
} from "../engine/index.js";
import { RunWaitingError, runtimeErrorPayload } from "../errors.js";
import { InMemoryEventLog } from "../events.js";
import { composeInstructions } from "../instructions.js";
import { discoverTools } from "../tools/index.js";
import type { DryRunScriptStep, RunProjectOptions, RunResult } from "../types/index.js";
import { finalizeRun } from "./finalize.js";
import { runDefaultDryRun } from "./strategies/default-dry.js";
import { runProviderBackedRun } from "./strategies/provider.js";
import { runScriptedDryRun } from "./strategies/scripted.js";

interface RunInput {
  root: string;
  startedAt: string;
  message?: string;
  script?: DryRunScriptStep[];
}

export async function runProject(
  root: string,
  options: RunProjectOptions = {},
): Promise<RunResult> {
  const engine = options.engine ?? createEngine({ journal: createMemoryJournal() });
  const runId = options.runId ?? `run-${randomUUID()}`;
  const input: RunInput = {
    root,
    startedAt: new Date().toISOString(),
    ...(options.message === undefined ? {} : { message: options.message }),
    ...(options.script === undefined ? {} : { script: options.script }),
  };

  return engine.run(runId, (ctx, journaled: RunInput) => runLoop(ctx, journaled, options), input);
}

/**
 * Continues runs a dead process left running. The provider and event store come from this process;
 * the project path, message and script come from the journal.
 */
export async function recoverRuns(
  options: RunProjectOptions & { engine: Engine },
): Promise<RecoveredRun[]> {
  return options.engine.recover<RunInput, RunResult>((_runId, input) =>
    input.message !== undefined && options.provider === undefined
      ? (ctx, journaled) => failMissingProvider(ctx, journaled, options)
      : (ctx, journaled) => runLoop(ctx, journaled, options),
  );
}

async function failMissingProvider(
  ctx: RunContext,
  input: RunInput,
  options: RunProjectOptions,
): Promise<RunResult> {
  const events = await InMemoryEventLog.open(ctx.runId, options.eventStore);
  const validation = await validateProject(input.root);
  if (events.all().length === 0) {
    await events.append("run.started", {
      projectRoot: validation.project?.root ?? input.root,
      projectName: validation.project?.config.name ?? "",
    });
    options.onStarted?.(ctx.runId);
  }
  events.continueAfterReplay();
  await events.append("run.error", {
    phase: "provider",
    message: "Cannot recover provider-backed run without a provider.",
  });
  await events.append("run.failed", { phase: "provider" });
  return finalizeRun({
    runId: ctx.runId,
    projectRoot: input.root,
    projectName: validation.project?.config.name ?? "",
    status: "failed",
    startedAt: input.startedAt,
    events: events.all(),
    eventStore: options.eventStore,
  });
}

async function runLoop(
  ctx: RunContext,
  input: RunInput,
  options: RunProjectOptions,
): Promise<RunResult> {
  const { runId } = ctx;
  const { root, startedAt } = input;
  const validation = await validateProject(root);
  const events = await InMemoryEventLog.open(runId, options.eventStore);
  const newlyStarted = events.all().length === 0;
  await events.append("run.started", {
    projectRoot: validation.project?.root ?? root,
    projectName: validation.project?.config.name ?? "",
  });
  if (newlyStarted) options.onStarted?.(runId);

  if (!validation.ok || !validation.project) {
    await events.append("run.error", { phase: "validation", issues: validation.errors });
    await events.append("run.failed", { phase: "validation" });

    return finalizeRun({
      runId,
      projectRoot: root,
      projectName: "",
      status: "failed",
      startedAt,
      events: events.all(),
      errors: validation.errors,
      eventStore: options.eventStore,
    });
  }

  const { project } = validation;
  const summary = {
    runId,
    projectRoot: project.root,
    projectName: project.config.name,
    startedAt,
    eventStore: options.eventStore,
  };

  try {
    const instructions = await composeInstructions(project);
    await events.append("instructions.composed", {
      length: instructions.content.length,
      sources: instructions.sources,
      content: instructions.content,
    });

    const tools = await discoverTools(project);
    await events.append("tools.discovered", {
      tools: tools.map((tool) => ({
        source: tool.source,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        capabilities: tool.capabilities,
        approval: tool.approval,
      })),
    });

    const output =
      options.provider !== undefined
        ? await runProviderBackedRun(
            ctx,
            options.provider,
            input.message,
            instructions.content,
            tools,
            events,
          )
        : input.script === undefined
          ? await runDefaultDryRun(project, events)
          : await runScriptedDryRun(ctx, input.script, tools, events);
    await events.append("run.completed", {
      ...(output === undefined ? {} : { output }),
    });

    return await finalizeRun({ ...summary, status: "completed", output, events: events.all() });
  } catch (error) {
    if (error instanceof RunWaitingError) {
      return finalizeRun({
        ...summary,
        status: "waiting",
        output: error.output,
        events: events.all(),
      });
    }

    await events.append("run.error", runtimeErrorPayload(error));
    await events.append("run.failed", { phase: "runtime" });

    return finalizeRun({ ...summary, status: "failed", events: events.all() });
  }
}
