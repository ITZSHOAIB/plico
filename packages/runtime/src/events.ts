import type { EventStreamType, PlicoEventPayloads } from "@plico/contracts";
import { ProjectChangedError } from "./engine/index.js";
import type { EventStore, PlicoEvent, PlicoEventType } from "./types/index.js";

export const runStreamType: EventStreamType = "run";

export class InMemoryEventLog {
  readonly #events: PlicoEvent[] = [];
  #replayed = 0;
  #cursor = 0;

  /**
   * Opens the log of a run that may have started before. The loop emits the same events again when
   * it replays; events already stored are matched, not written twice.
   */
  static async open(runId: string, store: EventStore | undefined): Promise<InMemoryEventLog> {
    const log = new InMemoryEventLog(runId, store);
    if (store) log.#events.push(...(await store.getEvents(runId)));
    log.#replayed = log.#events.length;
    return log;
  }

  constructor(
    private readonly runId: string,
    private readonly store: EventStore | undefined = undefined,
  ) {}

  async append<T extends PlicoEventType>(
    type: T,
    payload: PlicoEventPayloads[T],
  ): Promise<PlicoEvent> {
    if (this.#cursor < this.#replayed) {
      const recorded = this.#events[this.#cursor] as PlicoEvent;
      if (recorded.type !== type || JSON.stringify(recorded.payload) !== JSON.stringify(payload)) {
        // Later events (the failure) are appended after what the earlier attempt stored.
        this.#cursor = this.#replayed;
        throw new ProjectChangedError("event", this.#cursor, recorded.type, type);
      }
      this.#cursor += 1;
      return recorded;
    }
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
