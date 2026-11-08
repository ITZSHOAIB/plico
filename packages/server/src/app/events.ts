import type { PlicoEvent, RunStatus } from "@plico/contracts";
import type { PlicoEventType } from "@plico/runtime";
import { PlicoError } from "./errors.js";
import { inScope } from "./scope.js";
import type { AppDeps, EventFollowOptions } from "./types.js";

// Waiting is not terminal: the stream stays open for approval (#69). run.error is followed by
// run.failed, which closes the stream.
const terminalEventTypes: readonly PlicoEventType[] = [
  "run.completed",
  "run.failed",
  "run.cancelled",
];
const terminalStatuses: readonly RunStatus[] = ["completed", "failed", "cancelled"];

/**
 * Yields a run's events from a cursor and ends after its terminal event. The first read happens
 * on the first `next()`, so callers that need a 404 before writing anything check the run first.
 */
export async function* followEvents(
  deps: Pick<AppDeps, "eventStore" | "scope">,
  runId: string,
  options: EventFollowOptions & { stop: AbortSignal },
): AsyncGenerator<PlicoEvent, void, void> {
  const { eventStore } = deps;
  const stop = options.signal ? AbortSignal.any([options.signal, options.stop]) : options.stop;
  const pollMs = options.pollMs ?? 2000;
  const first = await eventStore.getRun(runId);
  if (!first || !inScope(deps, first.metadata))
    throw new PlicoError("run.not_found", `Unknown run ID: ${runId}`);

  let cursor = options.after ?? 0;
  while (!stop.aborted) {
    const events = await eventStore.getEvents(runId, { afterSequence: cursor });
    for (const event of events) {
      yield event;
      cursor = event.sequence;
    }
    if (events.some((event) => terminalEventTypes.includes(event.type as PlicoEventType))) return;

    const run = await eventStore.getRun(runId);
    if (run && terminalStatuses.includes(run.status)) {
      for (const event of await eventStore.getEvents(runId, { afterSequence: cursor })) yield event;
      return;
    }
    await sleep(pollMs, stop);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}
