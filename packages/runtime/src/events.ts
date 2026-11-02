import type { EventStreamType, PlicoEventPayloads } from "@plico/contracts";
import type { EventStore, PlicoEvent, PlicoEventType } from "./types/index.js";

export const runStreamType: EventStreamType = "run";

export class InMemoryEventLog {
  readonly #events: PlicoEvent[] = [];

  constructor(
    private readonly runId: string,
    private readonly store: EventStore | undefined = undefined,
  ) {}

  async append<T extends PlicoEventType>(
    type: T,
    payload: PlicoEventPayloads[T],
  ): Promise<PlicoEvent> {
    const sequence = this.#events.length + 1;
    // TypeScript cannot prove this generic object is a union member; callers are checked against PlicoEventPayloads[T].
    const event = {
      schemaVersion: 1,
      streamType: runStreamType,
      streamId: this.runId,
      runId: this.runId,
      id: `evt-${String(sequence).padStart(4, "0")}`,
      sequence,
      timestamp: new Date().toISOString(),
      type,
      payload,
    } as PlicoEvent;

    await this.store?.appendEvent(event);
    this.#events.push(event);
    return event;
  }

  all(): PlicoEvent[] {
    return [...this.#events];
  }
}
