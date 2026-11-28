import type { EventStore } from "@plico-ai/runtime";

export interface LiveOutput {
  store: EventStore;
  /** Whether any of the root run's own model text was written. */
  streamed(): boolean;
}

/**
 * Forward the root run's committed model text as it arrives, separating attempts on retries.
 * Child runs stay out of the terminal: their output is in the event log and reaches the root's result.
 */
export function streamModelOutput(store: EventStore, rootRunId: string): LiveOutput {
  const attempts = new Set<number>();
  let streamed = false;
  return {
    streamed: () => streamed,
    store: {
      ...store,
      async appendEvent(event) {
        await store.appendEvent(event);
        if (event.runId !== rootRunId) return;
        if (event.type === "model.attempt") {
          if (attempts.has(event.payload.turn))
            process.stdout.write("\n[Retrying model response]\n");
          attempts.add(event.payload.turn);
        } else if (event.type === "model.delta") {
          streamed = true;
          process.stdout.write(event.payload.text);
        }
      },
    },
  };
}
