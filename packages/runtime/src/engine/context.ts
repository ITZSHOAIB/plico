import { ProjectChangedError, RunCancelled, RunSuspended } from "./errors.js";
import type { Journal } from "./journal.js";
import type { RunContext, WaitOutcome } from "./types.js";

export interface Suspension {
  name: string;
  /** Epoch milliseconds, or null when the wait has no timeout. */
  deadline: number | null;
}

export interface EngineContext extends RunContext {
  /** Set once `wait` has stopped the run. */
  suspension(): Suspension | undefined;
  /** True once `step` or `wait` has stopped the run because it was cancelled. */
  cancelled(): boolean;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

/** The context one execution of a workflow sees. Steps and waits replay from the journal. */
export function createContext(
  runId: string,
  journal: Journal,
  now: () => number,
  signal: AbortSignal,
): EngineContext {
  let nextStep = 0;
  let suspended: Suspension | undefined;
  let stopped = false;

  async function checkCancel(): Promise<void> {
    if (signal.aborted || (await journal.getRun(runId))?.cancelRequested) {
      stopped = true;
      throw new RunCancelled();
    }
  }

  async function endWait(
    name: string,
    outcome: WaitOutcome<unknown>,
  ): Promise<WaitOutcome<unknown>> {
    if (await journal.resolveWait(runId, name, JSON.stringify(outcome))) return outcome;
    // Someone ended it first; the first outcome stands.
    const wait = await journal.getWait(runId, name);
    return JSON.parse(wait?.outcomeJson ?? JSON.stringify(outcome));
  }

  return {
    runId,
    signal,
    suspension: () => suspended,
    cancelled: () => stopped,
    async step(name, fn, options) {
      const index = nextStep++;
      const recorded = await journal.getStep(runId, index);
      if (recorded) {
        if (recorded.name !== name) {
          throw new ProjectChangedError("step", index, recorded.name, name);
        }
        return JSON.parse(recorded.resultJson);
      }
      await checkCancel();
      const retries = options?.retries ?? 0;
      for (let attempt = 0; ; attempt++) {
        try {
          const resultJson = toJson(await fn({ attempt, signal }));
          await journal.putStep(runId, index, { name, resultJson });
          return JSON.parse(resultJson);
        } catch (error) {
          // A step cut short by cancel is not recorded and not retried.
          if (signal.aborted) {
            stopped = true;
            throw new RunCancelled();
          }
          if (attempt >= retries) throw error;
        }
      }
    },
    async wait<T>(name: string, options?: { timeoutMs?: number }): Promise<WaitOutcome<T>> {
      await checkCancel();
      // The deadline is stored when the wait is first reached, so a restart keeps it.
      await journal.openWait(
        runId,
        name,
        options?.timeoutMs === undefined ? null : now() + options.timeoutMs,
      );
      const wait = await journal.getWait(runId, name);
      if (!wait) throw new Error(`Wait ${name} could not be opened.`);
      if (wait.outcomeJson !== null) return JSON.parse(wait.outcomeJson);
      const signal = await journal.getSignal(runId, name);
      if (signal !== undefined) {
        const outcome = await endWait(name, { kind: "signal", value: JSON.parse(signal) });
        return outcome as WaitOutcome<T>;
      }
      if (wait.deadline !== null && now() >= wait.deadline) {
        return (await endWait(name, { kind: "timeout" })) as WaitOutcome<T>;
      }
      suspended = { name, deadline: wait.deadline };
      throw new RunSuspended(name);
    },
  };
}
