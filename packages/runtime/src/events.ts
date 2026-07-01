import type { PlicoEvent, PlicoEventType } from "./types.js";

export class InMemoryEventLog {
  readonly #events: PlicoEvent[] = [];

  constructor(private readonly runId: string) {}

  append(type: PlicoEventType, payload: Record<string, unknown>): PlicoEvent {
    const sequence = this.#events.length + 1;
    const event: PlicoEvent = {
      schemaVersion: 1,
      runId: this.runId,
      id: `evt-${String(sequence).padStart(4, "0")}`,
      sequence,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };

    this.#events.push(event);
    return event;
  }

  all(): PlicoEvent[] {
    return [...this.#events];
  }
}
