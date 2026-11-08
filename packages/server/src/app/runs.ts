import type { PlicoEvent, RunSummary } from "@plico/contracts";
import { type DryRunScriptStep, type RunResult, runProject } from "@plico/runtime";
import { PlicoError } from "./errors.js";
import type { AppDeps } from "./types.js";

export async function startRun(
  deps: AppDeps,
  options: { script?: DryRunScriptStep[] } = {},
): Promise<{ runId: string }> {
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
    onStarted: resolveStarted,
  }).catch(rejectStarted);
  return { runId: await started };
}

/** Runs the project to the end without a model and returns its result. */
export function runDry(
  deps: AppDeps,
  options: { script?: DryRunScriptStep[] } = {},
): Promise<RunResult> {
  return runProject(deps.projectRoot, {
    ...(options.script === undefined ? {} : { script: options.script }),
    eventStore: deps.eventStore,
    engine: deps.engine,
  });
}

export async function requireRun(deps: AppDeps, runId: string): Promise<RunSummary> {
  const run = await deps.eventStore.getRun(runId);
  if (!run) throw new PlicoError("run.not_found", `Unknown run ID: ${runId}`);
  return run;
}

export async function cancelRun(deps: AppDeps, runId: string): Promise<string> {
  await requireRun(deps, runId);
  return deps.engine.cancel(runId);
}

export async function signalRun(
  deps: AppDeps,
  runId: string,
  name: string,
  value: unknown,
): Promise<string> {
  await requireRun(deps, runId);
  if (!name) throw new PlicoError("request.invalid", "A signal name is required.");
  return deps.engine.signal(runId, name, value);
}

/** Approval decisions are signals on the wait named `approval:<requestId>` (ADR 0008). */
export function decideApproval(
  deps: AppDeps,
  runId: string,
  requestId: string,
  approved: boolean,
): Promise<string> {
  return signalRun(deps, runId, `approval:${requestId}`, { approved });
}

export async function listRunEvents(
  deps: AppDeps,
  runId: string,
  afterSequence?: number,
): Promise<PlicoEvent[]> {
  await requireRun(deps, runId);
  return deps.eventStore.getEvents(runId, afterSequence === undefined ? {} : { afterSequence });
}
