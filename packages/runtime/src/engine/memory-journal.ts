import type { Journal, JournalRun, JournalStep, JournalWait, Lease } from "./journal.js";

interface Held extends JournalRun {
  lease: Lease;
}

export function createMemoryJournal(): Journal {
  const runs = new Map<string, Held>();
  const steps = new Map<string, JournalStep>();
  const waits = new Map<string, JournalWait>();
  const signals = new Map<string, string>();

  return {
    async begin(runId, inputJson, lease) {
      if (runs.has(runId)) return false;
      runs.set(runId, { runId, state: "running", inputJson, cancelRequested: false, lease });
      return true;
    },
    async getRun(runId) {
      const run = runs.get(runId);
      return (
        run && {
          runId,
          state: run.state,
          inputJson: run.inputJson,
          cancelRequested: run.cancelRequested,
        }
      );
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
    async claimWaiting(runId, lease, expected) {
      const run = runs.get(runId);
      if (run?.state !== "waiting") return false;
      if (
        expected &&
        (run.lease.workerId !== expected.workerId || run.lease.until !== expected.until)
      )
        return false;
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
    async listReady(now) {
      return [...runs.values()]
        .filter((run) => {
          if (run.state !== "waiting") return false;
          if (run.cancelRequested) return true;
          return [...waits.entries()].some(([key, wait]) => {
            if (!key.startsWith(`${run.runId}\u0000`) || wait.outcomeJson !== null) return false;
            return signals.has(key) || (wait.deadline !== null && wait.deadline <= now);
          });
        })
        .map((run) => ({ runId: run.runId, held: run.lease }));
    },
    async requestCancel(runId) {
      const run = runs.get(runId);
      if (!run || run.cancelRequested || ["completed", "failed", "cancelled"].includes(run.state)) {
        return false;
      }
      run.cancelRequested = true;
      return true;
    },
    async listWaiting() {
      return [...runs.values()]
        .filter((run) => run.state === "waiting")
        .flatMap((run) =>
          [...waits.entries()]
            .filter(([key, wait]) => key.startsWith(`${run.runId}\0`) && wait.outcomeJson === null)
            .map(([, wait]) => ({ runId: run.runId, deadline: wait.deadline })),
        );
    },
    async getWait(runId, name) {
      const wait = waits.get(`${runId}\u0000${name}`);
      return wait && { ...wait };
    },
    async openWait(runId, name, deadline) {
      const key = `${runId}\u0000${name}`;
      if (!waits.has(key)) waits.set(key, { deadline, outcomeJson: null });
    },
    async resolveWait(runId, name, outcomeJson) {
      const wait = waits.get(`${runId}\u0000${name}`);
      if (!wait || wait.outcomeJson !== null) return false;
      wait.outcomeJson = outcomeJson;
      return true;
    },
    async putSignal(runId, name, valueJson) {
      const key = `${runId}\u0000${name}`;
      if (signals.has(key)) return false;
      signals.set(key, valueJson);
      return true;
    },
    async getSignal(runId, name) {
      return signals.get(`${runId}\u0000${name}`);
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
