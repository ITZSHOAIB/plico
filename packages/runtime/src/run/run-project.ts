import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { type Span, SpanStatusCode } from "@opentelemetry/api";
import { validateProject } from "@plico-ai/core";
import {
  createEngine,
  createMemoryJournal,
  type Engine,
  type RecoveredRun,
  RunCancelled,
  type RunContext,
} from "../engine/index.js";
import { RunWaitingError, runtimeErrorPayload } from "../errors.js";
import { InMemoryEventLog } from "../events.js";
import type { Metadata } from "../storage/metadata.js";
import { discoverTools } from "../tools/index.js";
import type { DryRunScriptStep, RunProjectOptions, RunResult } from "../types/index.js";
import { finalizeRun } from "./finalize.js";
import { ignoredWhenPinned, pinInstructions } from "./pinned-instructions.js";
import { recordTools } from "./record-tools.js";
import { runDryStrategy } from "./strategies/dry.js";
import { runProviderBackedRun } from "./strategies/provider.js";
import {
  type StoredSpanContext,
  startRunSpan,
  storeSpanContext,
  tracedContext,
} from "./tracing.js";

interface RunInput {
  root: string;
  displayRoot?: string;
  startedAt: string;
  message?: string;
  threadId?: string;
  metadata?: Metadata;
  context?: Metadata;
  history?: RunProjectOptions["history"];
  script?: DryRunScriptStep[];
  mockTools?: boolean;
  providerRecoveryKey?: string;
  traceContext?: StoredSpanContext;
}

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

/**
 * Continues runs a dead process left running. The provider and event store come from this process;
 * the project path, message and script come from the journal.
 */
export async function recoverRuns(
  options: RunProjectOptions & {
    engine: Engine;
    recoveryFilter?: { projectRoot: string; providerRecoveryKey?: string; providerOnly?: boolean };
    onRecoveryStarted?: (runId: string) => void;
    onRecoverySettled?: (runId: string) => void;
  },
): Promise<RecoveredRun[]> {
  const recovered = await options.engine.recover<RunInput, RunResult>((_runId, input) => {
    const filter = options.recoveryFilter;
    if (
      filter &&
      (!isAbsolute(input.root) ||
        projectIdentity(input.root) !== projectIdentity(filter.projectRoot) ||
        (filter.providerOnly === true && input.message === undefined) ||
        (input.message !== undefined &&
          (!input.providerRecoveryKey ||
            !filter.providerRecoveryKey ||
            input.providerRecoveryKey !== filter.providerRecoveryKey)))
    )
      return undefined;
    const { provider: _provider, ...withoutProvider } = options;
    return async (ctx, journaled) => {
      const span = startRunSpan(ctx.runId, input.traceContext);
      options.onRecoveryStarted?.(ctx.runId);
      try {
        const result =
          input.message === undefined
            ? isLegacyScript(input)
              ? await failRecovery(ctx, journaled, options, "recovery", legacyScriptMessage)
              : await runLoop(ctx, journaled, withoutProvider, span)
            : options.provider === undefined
              ? await failRecovery(
                  ctx,
                  journaled,
                  options,
                  "provider",
                  "Cannot recover provider-backed run without a provider.",
                )
              : await runLoop(ctx, journaled, options, span);
        if (result.status === "failed") span.setStatus({ code: SpanStatusCode.ERROR });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
        options.onRecoverySettled?.(ctx.runId);
      }
    };
  });
  return recovered.map(({ runId, state, error, output }) => ({
    runId,
    state: output && output.status !== "running" ? output.status : state,
    ...(error === undefined ? {} : { error }),
  }));
}

function projectIdentity(root: string): string {
  const absolute = resolve(root);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

const legacyScriptMessage =
  "This scripted run was started by an older Plico that did not record whether its tools may run, so it is not resumed. Start it again.";

/**
 * A script journaled before runs recorded `mockTools`. It may have come from an API caller, so
 * resuming it could run handlers that caller should never reach; it fails instead.
 */
function isLegacyScript(input: RunInput): boolean {
  return input.script !== undefined && !("mockTools" in input);
}

async function failRecovery(
  ctx: RunContext,
  input: RunInput,
  options: RunProjectOptions,
  phase: string,
  message: string,
): Promise<RunResult> {
  const events = await InMemoryEventLog.open(ctx.runId, options.eventStore);
  const validation = await validateProject(input.root);
  if (events.all().length === 0) {
    await events.append("run.started", {
      projectRoot: input.displayRoot ?? input.root,
      projectName: validation.project?.config.name ?? "",
    });
    options.onStarted?.(ctx.runId);
  }
  events.continueAfterReplay();
  await events.append("run.error", { phase, message });
  await events.append("run.failed", { phase });
  return finalizeRun({
    runId: ctx.runId,
    projectRoot: input.displayRoot ?? input.root,
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
  span: Span,
): Promise<RunResult> {
  const { runId } = ctx;
  const { root, startedAt } = input;
  const displayRoot = input.displayRoot ?? root;
  const validation = await validateProject(root);
  const events = await InMemoryEventLog.open(runId, options.eventStore);
  const errors = events.all().some((event) => event.type === "instructions.composed")
    ? validation.errors.filter((issue) => !ignoredWhenPinned(issue))
    : validation.errors;
  const newlyStarted = events.all().length === 0;
  await events.append("run.started", {
    projectRoot: displayRoot,
    projectName: validation.project?.config.name ?? "",
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ...(input.context === undefined ? {} : { context: input.context }),
  });
  if (newlyStarted) options.onStarted?.(runId);

  if (errors.length > 0 || !validation.project) {
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
  ctx = tracedContext(ctx, span, project.config.model);
  const summary = {
    runId,
    projectRoot: displayRoot,
    projectName: project.config.name,
    startedAt,
    eventStore: options.eventStore,
  };

  try {
    const { instructions, skills, outputSchema } = await pinInstructions(project, events);

    const tools = await discoverTools(project);
    await recordTools(project.root, tools, events);

    const output =
      options.provider !== undefined
        ? await runProviderBackedRun(
            ctx,
            options.provider,
            input.message,
            instructions.content,
            tools,
            events,
            options.eventStore,
            project.config.model,
            project.config,
            input.history,
            skills,
            outputSchema,
          )
        : await runDryStrategy(
            ctx,
            project,
            tools,
            events,
            options.eventStore,
            input.script,
            input.mockTools === true,
            outputSchema,
          );
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

    if (error instanceof RunCancelled) {
      await events.append("run.cancelled", {});
      return finalizeRun({ ...summary, status: "cancelled", events: events.all() });
    }

    await events.append("run.error", runtimeErrorPayload(error));
    await events.append("run.failed", { phase: "runtime" });

    return finalizeRun({ ...summary, status: "failed", events: events.all() });
  }
}
