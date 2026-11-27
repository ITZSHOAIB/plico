import type { JsonValue, PlicoEvent, RunSummary } from "@plico-ai/contracts";
import { prepareRunMessage } from "@plico-ai/core";
import {
  type DryRunScriptStep,
  engineWaitTarget,
  type RunProjectOptions,
  type RunResult,
  runProject,
} from "@plico-ai/runtime";
import { PlicoError } from "./errors.js";
import { readMetadata } from "./metadata.js";
import { inScope, scopedFilter, scopedMetadata } from "./scope.js";
import type { AppDeps } from "./types.js";

export async function startRun(
  deps: AppDeps,
  options: {
    script?: DryRunScriptStep[];
    mockTools?: boolean;
    metadata?: unknown;
    context?: unknown;
    agent?: string;
    workflow?: string;
    input?: JsonValue;
    message?: string;
  } = {},
): Promise<{ runId: string }> {
  const metadata = scopedMetadata(deps, readMetadata(options.metadata));
  const context = readMetadata(options.context, "context") ?? deps.context;
  const model = await modelRun(deps, options);
  let resolveStarted!: (runId: string) => void;
  let rejectStarted!: (error: unknown) => void;
  const started = new Promise<string>((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  void runProject(deps.projectRoot, {
    eventStore: deps.eventStore,
    engine: deps.engine,
    ...(options.script === undefined ? {} : { script: options.script }),
    ...(options.mockTools === true ? { mockTools: true } : {}),
    ...(metadata === undefined ? {} : { metadata }),
    ...(context === undefined ? {} : { context }),
    ...(options.agent === undefined ? {} : { agent: options.agent }),
    ...(options.workflow === undefined ? {} : { workflow: options.workflow }),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...model,
    onStarted: resolveStarted,
  }).catch(rejectStarted);
  return { runId: await started };
}

/**
 * Without a script, a `message` or `input` runs the selected agent or workflow on the configured
 * model. Anything else stays a run with no model.
 */
async function modelRun(
  deps: AppDeps,
  options: {
    script?: unknown;
    agent?: string;
    workflow?: string;
    input?: JsonValue;
    message?: string;
  },
): Promise<Partial<RunProjectOptions>> {
  if (
    options.script !== undefined ||
    (options.message === undefined && options.input === undefined)
  )
    return {};
  if (!deps.provider)
    throw new PlicoError(
      "provider.unavailable",
      "Configure a model provider before sending a message.",
    );
  const prepared = await prepareRunMessage(
    deps.projectRoot,
    { content: options.message, input: options.input },
    {
      ...(options.agent === undefined ? {} : { agent: options.agent }),
      ...(options.workflow === undefined ? {} : { workflow: options.workflow }),
    },
  );
  if (!prepared.ok) throw new PlicoError("input.invalid", prepared.errors.join("; "));
  if (prepared.message === undefined || !prepared.message.trim())
    throw new PlicoError("message.invalid", "Message content must be a nonempty string.");
  return {
    message: prepared.message,
    provider: deps.provider,
    ...(deps.providerForModel ? { providerForModel: deps.providerForModel } : {}),
    ...(deps.providerRecoveryKey ? { providerRecoveryKey: deps.providerRecoveryKey } : {}),
  };
}

/** Runs the project to the end without a model and returns its result. */
export function runDry(
  deps: AppDeps,
  options: { script?: DryRunScriptStep[]; mockTools?: boolean } = {},
): Promise<RunResult> {
  return runProject(deps.projectRoot, {
    ...(options.script === undefined ? {} : { script: options.script }),
    ...(options.mockTools === true ? { mockTools: true } : {}),
    eventStore: deps.eventStore,
    engine: deps.engine,
  });
}

/** Root runs, or the child runs of `parentRunId`. Every run stays readable by ID. */
export async function listRuns(
  deps: AppDeps,
  filter: { metadata?: unknown; parentRunId?: string } = {},
): Promise<RunSummary[]> {
  const metadata = scopedFilter(deps, readMetadata(filter.metadata));
  return deps.eventStore.listRuns({
    ...(metadata === undefined ? {} : { metadata }),
    ...(filter.parentRunId === undefined ? {} : { parentRunId: filter.parentRunId }),
  });
}

export async function requireRun(deps: AppDeps, runId: string): Promise<RunSummary> {
  const run = await deps.eventStore.getRun(runId);
  if (!run || !inScope(deps, run.metadata))
    throw new PlicoError("run.not_found", `Unknown run ID: ${runId}`);
  return run;
}

/** A child run shares its root's engine run, so only the root can be cancelled. */
export async function cancelRun(deps: AppDeps, runId: string): Promise<string> {
  const run = await requireRun(deps, runId);
  if (run.rootRunId !== undefined && run.rootRunId !== run.runId)
    throw new PlicoError(
      "run.child",
      `Run ${runId} is a child run of ${run.rootRunId}. Cancel ${run.rootRunId}, which cancels every child run.`,
    );
  return deps.engine.cancel(runId);
}

/**
 * Sends a client's signal. An approval signal from a client carries no `context` of its own: only
 * the host may say who decided, through `decideApproval` or the `context` of a mounted handler.
 */
export function signalRun(
  deps: AppDeps,
  runId: string,
  name: string,
  value: unknown,
): Promise<string> {
  const clean =
    name.startsWith("approval:") &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
      ? {
          ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== "context")),
          ...(deps.context === undefined ? {} : { context: deps.context }),
        }
      : value;
  return sendSignal(deps, runId, name, clean);
}

async function sendSignal(
  deps: AppDeps,
  runId: string,
  name: string,
  value: unknown,
): Promise<string> {
  const run = await requireRun(deps, runId);
  if (!name) throw new PlicoError("request.invalid", "A signal name is required.");
  const target = await engineTarget(deps, run, name);
  return deps.engine.signal(target.runId, target.name, value);
}

/**
 * Where a signal lands. A child's waits live in its root's engine run under prefixed names; an
 * approval sent to the root for a child's request finds the child from the mirrored request.
 */
async function engineTarget(
  deps: AppDeps,
  run: RunSummary,
  name: string,
): Promise<{ runId: string; name: string }> {
  if (run.rootRunId !== undefined && run.rootRunId !== run.runId)
    return engineWaitTarget(run.runId, run.rootRunId, name);
  if (name.startsWith("approval:")) {
    const requestId = name.slice("approval:".length);
    const asked = (await deps.eventStore.getEvents(run.runId)).find(
      (event) => event.type === "approval.requested" && event.payload.requestId === requestId,
    );
    const childRunId = asked?.type === "approval.requested" ? asked.payload.runId : undefined;
    if (childRunId !== undefined) return engineWaitTarget(childRunId, run.runId, name);
  }
  return { runId: run.runId, name };
}

/** Approval decisions are signals on the wait named `approval:<requestId>` (ADR 0008). */
export function decideApproval(
  deps: AppDeps,
  runId: string,
  requestId: string,
  approved: boolean,
  options: { context?: unknown } = {},
): Promise<string> {
  const context = readMetadata(options.context, "context") ?? deps.context;
  return sendSignal(deps, runId, `approval:${requestId}`, {
    approved,
    ...(context === undefined ? {} : { context }),
  });
}

export async function listRunEvents(
  deps: AppDeps,
  runId: string,
  afterSequence?: number,
): Promise<PlicoEvent[]> {
  await requireRun(deps, runId);
  return deps.eventStore.getEvents(runId, afterSequence === undefined ? {} : { afterSequence });
}
