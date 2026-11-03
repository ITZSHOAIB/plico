import type { Journal, JournalRun, JournalStep } from "./journal.js";

export function createMemoryJournal(): Journal {
  const runs = new Map<string, JournalRun>();
  const steps = new Map<string, JournalStep>();

  return {
    async begin(runId, inputJson) {
      if (runs.has(runId)) return false;
      runs.set(runId, { runId, state: "running", inputJson });
      return true;
    },
    async getRun(runId) {
      const run = runs.get(runId);
      return run && { ...run };
    },
    async setState(runId, state) {
      const run = runs.get(runId);
      if (run) run.state = state;
    },
    async getStep(runId, index) {
      return steps.get(`${runId}:${index}`);
    },
    async putStep(runId, index, step) {
      const key = `${runId}:${index}`;
      if (!steps.has(key)) steps.set(key, step);
    },
  };
}
