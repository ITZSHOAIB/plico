import type { EventStore } from "@plico-ai/runtime";

/** Forward committed model text as it arrives, separating attempts on retries. */
export function streamModelOutput(store: EventStore): EventStore {
  const attempts = new Set<number>();
  return {
    ...store,
    async appendEvent(event) {
      await store.appendEvent(event);
      if (event.type === "model.attempt") {
        if (attempts.has(event.payload.turn)) process.stdout.write("\n[Retrying model response]\n");
        attempts.add(event.payload.turn);
      } else if (event.type === "model.delta") {
        process.stdout.write(event.payload.text);
      }
    },
  };
}
