import { ProjectChangedError } from "./errors.js";
import type { Journal } from "./journal.js";
import type { Engine, RunContext, RunHandle, Workflow } from "./types.js";

export interface EngineOptions {
  journal: Journal;
}

function toJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

export function createEngine({ journal }: EngineOptions): Engine {
  function contextFor(runId: string): RunContext {
    let next = 0;
    return {
      runId,
      async step(name, fn, options) {
        const index = next++;
        const recorded = await journal.getStep(runId, index);
        if (recorded) {
          if (recorded.name !== name) throw new ProjectChangedError(index, recorded.name, name);
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
    try {
      const output = await workflow(contextFor(runId), input);
      await journal.setState(runId, "completed");
      return output;
    } catch (error) {
      await journal.setState(runId, "failed");
      throw error;
    }
  }

  async function start<I, O>(
    runId: string,
    workflow: Workflow<I, O>,
    input: I,
  ): Promise<RunHandle<O>> {
    const inputJson = toJson(input);
    if (!(await journal.begin(runId, inputJson))) {
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
      await journal.setState(runId, "running");
      return execute(runId, workflow, JSON.parse(run.inputJson));
    },
    async status(runId) {
      const run = await journal.getRun(runId);
      return run && { state: run.state };
    },
  };
}
