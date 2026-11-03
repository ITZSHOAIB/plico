import { randomUUID } from "node:crypto";
import { createContext, toJson } from "./context.js";
import { RunCancelled, RunSuspended } from "./errors.js";
import type { Journal, Lease } from "./journal.js";
import type {
  CancelResult,
  Engine,
  RecoveredRun,
  RunHandle,
  RunOutcome,
  SignalResult,
  Workflow,
} from "./types.js";

export interface EngineOptions {
  journal: Journal;
  /** Names this engine's hold on runs. Must be unique per live process. */
  workerId?: string;
  /** How long a worker holds a run before another may take it. Renewed while the run executes. */
  leaseMs?: number;
  now?: () => number;
}

export const defaultLeaseMs = 30_000;

interface Registered {
  workflow: Workflow<unknown, unknown>;
  input: unknown;
}

export function createEngine({
  journal,
  workerId = randomUUID(),
  leaseMs = defaultLeaseMs,
  now = Date.now,
}: EngineOptions): Engine {
  const lease = (): Lease => ({ workerId, until: now() + leaseMs });
  /** Runs this process can continue by itself when a signal or timeout arrives. */
  const registered = new Map<string, Registered>();
  /** Runs executing in this process right now. */
  const active = new Set<string>();
  const timers = new Map<string, NodeJS.Timeout>();
  /** Aborts the step a run is executing here when it is cancelled. */
  const controllers = new Map<string, AbortController>();

  function stopTimer(runId: string): void {
    clearTimeout(timers.get(runId));
    timers.delete(runId);
  }

  /** Runs the workflow, replaying it each time a wait ends, until it completes or must wait. */
  async function execute<I, O>(
    runId: string,
    workflow: Workflow<I, O>,
    input: I,
  ): Promise<RunOutcome<O>> {
    registered.set(runId, { workflow, input } as Registered);
    stopTimer(runId);
    const controller = new AbortController();
    controllers.set(runId, controller);
    const heartbeat = setInterval(() => {
      journal.renew(runId, lease()).catch(() => undefined);
      // Cancel may have been requested from another process.
      journal
        .getRun(runId)
        .then((run) => run?.cancelRequested && controller.abort())
        .catch(() => undefined);
    }, leaseMs / 3);
    heartbeat.unref();
    try {
      for (;;) {
        const ctx = createContext(runId, journal, now, controller.signal);
        let output: O | undefined;
        let returned = false;
        try {
          output = await workflow(ctx, input);
          returned = true;
        } catch (error) {
          if (!(error instanceof RunSuspended || error instanceof RunCancelled)) throw error;
        }
        if (ctx.cancelled()) {
          await journal.setState(runId, "cancelled");
          registered.delete(runId);
          return returned ? { state: "cancelled", output: output as O } : { state: "cancelled" };
        }
        const suspension = ctx.suspension();
        if (!suspension) {
          await journal.setState(runId, "completed");
          registered.delete(runId);
          return { state: "completed", output: output as O };
        }
        await journal.setState(runId, "waiting");
        // A signal or timeout that landed while the run was stopping must not be lost.
        const wait = await journal.getWait(runId, suspension.name);
        const ready =
          (await journal.getRun(runId))?.cancelRequested === true ||
          (await journal.getSignal(runId, suspension.name)) !== undefined ||
          (wait?.deadline != null && now() >= wait.deadline);
        if (ready) {
          if (await journal.claimWaiting(runId, lease())) continue;
          // Another worker took the run; report what this execution produced before it stopped.
          return returned ? { state: "waiting", output: output as O } : { state: "waiting" };
        }
        if (suspension.deadline !== null) {
          const delay = Math.max(0, suspension.deadline - now());
          const timer = setTimeout(() => resumeHere(runId).catch(() => undefined), delay);
          timer.unref();
          timers.set(runId, timer);
        }
        return returned ? { state: "waiting", output: output as O } : { state: "waiting" };
      }
    } catch (error) {
      await journal.setState(runId, "failed");
      registered.delete(runId);
      throw error;
    } finally {
      clearInterval(heartbeat);
      controllers.delete(runId);
      active.delete(runId);
    }
  }

  /** Continues a waiting run this process started, once its wait can end. */
  async function resumeHere(runId: string): Promise<void> {
    const known = registered.get(runId);
    if (!known || active.has(runId)) return;
    active.add(runId);
    try {
      const run = await journal.getRun(runId);
      if (run?.state !== "waiting") {
        active.delete(runId);
        return;
      }
      if (!(await journal.claimWaiting(runId, lease()))) {
        active.delete(runId);
        return;
      }
    } catch (error) {
      active.delete(runId);
      throw error;
    }
    // Everything the run did is in the event log; its outcome here has no reader.
    execute(runId, known.workflow, known.input).catch(() => undefined);
  }

  async function start<I, O>(
    runId: string,
    workflow: Workflow<I, O>,
    input: I,
  ): Promise<RunHandle<O>> {
    const inputJson = toJson(input);
    if (!(await journal.begin(runId, inputJson, lease()))) {
      throw new Error(`Run ${runId} already exists.`);
    }
    active.add(runId);
    const result = execute(runId, workflow, JSON.parse(inputJson) as I);
    // The handle's reader observes the failure; this keeps an unread handle from crashing the process.
    result.catch(() => undefined);
    return { runId, result: () => result };
  }

  return {
    start,
    async run(runId, workflow, input) {
      return (await start(runId, workflow, input)).result();
    },
    async resume(runId, workflow) {
      const run = await journal.getRun(runId);
      if (!run) throw new Error(`Run ${runId} is unknown.`);
      if (run.state === "completed" || run.state === "cancelled")
        throw new Error(`Run ${runId} already finished.`);
      if (run.state === "running") {
        const stale = (await journal.listStale(workerId, now())).find(
          (item) => item.runId === runId,
        );
        if (!stale || !(await journal.claim(runId, lease(), stale.held)))
          throw new Error(`Run ${runId} is held by a live worker or its lease changed.`);
      } else if (
        !(await (run.state === "waiting"
          ? journal.claimWaiting(runId, lease())
          : journal.claim(runId, lease())))
      ) {
        throw new Error(`Run ${runId} could not be claimed.`);
      }
      active.add(runId);
      return execute(runId, workflow, JSON.parse(run.inputJson));
    },
    async signal(runId, name, value): Promise<SignalResult> {
      const run = await journal.getRun(runId);
      if (!run) return "unknown";
      if (["completed", "failed", "cancelled"].includes(run.state)) return "ignored";
      const wait = await journal.getWait(runId, name);
      if (wait?.outcomeJson != null) return "ignored";
      if (wait?.deadline != null && now() >= wait.deadline) {
        // The deadline passed first: the wait ends as a timeout and this decision is late.
        await journal.resolveWait(runId, name, JSON.stringify({ kind: "timeout" }));
        resumeHere(runId).catch(() => undefined);
        return "ignored";
      }
      if (!(await journal.putSignal(runId, name, toJson(value)))) return "ignored";
      resumeHere(runId).catch(() => undefined);
      return "accepted";
    },
    async cancel(runId): Promise<CancelResult> {
      const run = await journal.getRun(runId);
      if (!run) return "unknown";
      if (!(await journal.requestCancel(runId))) return "ignored";
      const running = controllers.get(runId);
      if (running) running.abort();
      else resumeHere(runId).catch(() => undefined);
      return "accepted";
    },
    async recover<I, O>(
      resolve: (runId: string, input: I) => Workflow<I, O> | undefined,
    ): Promise<RecoveredRun<O>[]> {
      for (const { runId, deadline } of await journal.listWaiting()) {
        if (active.has(runId) || registered.has(runId)) continue;
        const run = await journal.getRun(runId);
        if (!run || run.state !== "waiting") continue;
        const input = JSON.parse(run.inputJson) as I;
        const workflow = resolve(runId, input);
        if (!workflow) continue;
        registered.set(runId, { workflow, input } as Registered);
        if (deadline !== null) {
          const timer = setTimeout(
            () => resumeHere(runId).catch(() => undefined),
            Math.max(0, deadline - now()),
          );
          timer.unref();
          timers.set(runId, timer);
        }
      }
      const candidates = [
        ...(await journal.listStale(workerId, now())).map((item) => ({ ...item, waiting: false })),
        ...(await journal.listReady(now())).map((item) => ({ ...item, waiting: true })),
      ];
      const recovered: Array<Promise<RecoveredRun<O>>> = [];
      for (const { runId, held, waiting } of candidates) {
        if (active.has(runId)) continue;
        const run = await journal.getRun(runId);
        if (!run) continue;
        const input = JSON.parse(run.inputJson) as I;
        const workflow = resolve(runId, input);
        if (
          !workflow ||
          !(await (waiting
            ? journal.claimWaiting(runId, lease(), held)
            : journal.claim(runId, lease(), held)))
        )
          continue;
        active.add(runId);
        recovered.push(
          execute(runId, workflow, input).then(
            (outcome): RecoveredRun<O> => ({
              runId,
              state: outcome.state,
              ...(outcome.output === undefined ? {} : { output: outcome.output }),
            }),
            (error: unknown): RecoveredRun<O> => ({
              runId,
              state: "failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
      }
      return Promise.all(recovered);
    },
    async status(runId) {
      const run = await journal.getRun(runId);
      return run && { state: run.state };
    },
  };
}
