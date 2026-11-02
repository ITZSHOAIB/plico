import type { Journal, JournalRun, JournalStep, Lease } from "./journal.js";

interface Held extends JournalRun {
  lease: Lease;
}

export function createMemoryJournal(): Journal {
  const runs = new Map<string, Held>();
  const steps = new Map<string, JournalStep>();

  return {
    async begin(runId, inputJson, lease) {
      if (runs.has(runId)) return false;
      runs.set(runId, { runId, state: "running", inputJson, lease });
      return true;
    },
    async getRun(runId) {
      const run = runs.get(runId);
      return run && { runId, state: run.state, inputJson: run.inputJson };
    },
    async setState(runId, state) {
      const run = runs.get(runId);
      if (run) run.state = state;
    },
    async renew(runId, lease) {
      const run = runs.get(runId);
      if (run?.lease.workerId === lease.workerId) run.lease = lease;
    },
    async claim(runId, lease, expected) {
      const run = runs.get(runId);
      if (!run) return false;
      if (
        expected &&
        (run.lease.workerId !== expected.workerId || run.lease.until !== expected.until)
      ) {
        return false;
      }
      run.lease = lease;
      run.state = "running";
      return true;
    },
    async listStale(workerId, now) {
      return [...runs.values()]
        .filter(
          (run) =>
            run.state === "running" && run.lease.workerId !== workerId && run.lease.until < now,
        )
        .map((run) => ({ runId: run.runId, held: run.lease }));
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
