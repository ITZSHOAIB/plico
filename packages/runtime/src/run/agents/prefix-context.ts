import type { RunContext } from "../../engine/index.js";

/**
 * The context of a child run. It shares its parent's engine run, so every step and wait name is
 * prefixed with the child's segment, such as `d0-1/model:0`, and replays in the same place.
 */
export function prefixContext(parent: RunContext, runId: string, segment: string): RunContext {
  return {
    runId,
    get signal() {
      return parent.signal;
    },
    step: (name, fn, options) => parent.step(`${segment}/${name}`, fn, options),
    wait: (name, options) => parent.wait(`${segment}/${name}`, options),
  };
}

/**
 * Where a run's waits live: its root's engine run, under the segments between them. A child ID is
 * its parent's ID plus `.` and a segment, so `run-1.d0-0` waits as `d0-0/<name>` in `run-1`.
 */
export function engineWaitTarget(
  runId: string,
  rootRunId: string,
  name: string,
): { runId: string; name: string } {
  if (runId === rootRunId) return { runId, name };
  const segments = runId.slice(rootRunId.length + 1).split(".");
  return { runId: rootRunId, name: `${segments.join("/")}/${name}` };
}
