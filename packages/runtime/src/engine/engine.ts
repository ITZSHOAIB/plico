import { randomUUID } from "node:crypto";
import { ProjectChangedError } from "./errors.js";
import type { Journal, Lease } from "./journal.js";
import type { Engine, RecoveredRun, RunContext, RunHandle, Workflow } from "./types.js";

export interface EngineOptions {
  journal: Journal;
  /** Names this engine's hold on runs. Must be unique per live process. */
  workerId?: string;
  /** How long a worker holds a run before another may take it. Renewed while the run executes. */
  leaseMs?: number;
  now?: () => number;
}

export const defaultLeaseMs = 30_000;

function toJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

export function createEngine({
  journal,
  workerId = randomUUID(),
  leaseMs = defaultLeaseMs,
  now = Date.now,
}: EngineOptions): Engine {
  const lease = (): Lease => ({ workerId, until: now() + leaseMs });

  function contextFor(runId: string): RunContext {
    let next = 0;
    return {
      runId,
      async step(name, fn, options) {
        const index = next++;
        const recorded = await journal.getStep(runId, index);
        if (recorded) {
          if (recorded.name !== name)
            throw new ProjectChangedError("step", index, recorded.name, name);
          return JSON.parse(recorded.resultJson);
        }
        const retries = options?.retries ?? 0;
        for (let attempt = 0; ; attempt++) {
          try {
            const resultJson = toJson(await fn({ attempt }));
            await journal.putStep(runId, index, { name, resultJson });
            return JSON.parse(resultJson);
          } catch (error) {
            if (attempt >= retries) throw error;
          }
        }
      },
    };
  }

  async function execute<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<O> {
    const heartbeat = setInterval(() => {
      journal.renew(runId, lease()).catch(() => undefined);
    }, leaseMs / 3);
    heartbeat.unref();
    try {
      const output = await workflow(contextFor(runId), input);
      await journal.setState(runId, "completed");
      return output;
    } catch (error) {
      await journal.setState(runId, "failed");
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
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
      if (run.state === "completed") throw new Error(`Run ${runId} already finished.`);
      await journal.claim(runId, lease());
      return execute(runId, workflow, JSON.parse(run.inputJson));
    },
    async recover<I, O>(
      resolve: (runId: string, input: I) => Workflow<I, O> | undefined,
    ): Promise<RecoveredRun[]> {
      const recovered: Array<Promise<RecoveredRun>> = [];
      for (const { runId, held } of await journal.listStale(workerId, now())) {
        const run = await journal.getRun(runId);
        if (!run) continue;
        const input = JSON.parse(run.inputJson) as I;
        const workflow = resolve(runId, input);
        if (!workflow || !(await journal.claim(runId, lease(), held))) continue;
        recovered.push(
          execute(runId, workflow, input).then(
            (): RecoveredRun => ({ runId, state: "completed" }),
            (error: unknown): RecoveredRun => ({
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
