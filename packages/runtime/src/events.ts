import type { EventStreamType, PlicoEventPayloads } from "@plico/contracts";
import { ProjectChangedError } from "./engine/index.js";
import type { EventStore, PlicoEvent, PlicoEventType } from "./types/index.js";

export const runStreamType: EventStreamType = "run";

/**
 * Build the terminal failure pair both recovery paths append. The caller supplies the tail so
 * appending to an event store and inserting directly into SQLite share one sequencing scheme.
 */
export function runFailureEvents(
  runId: string,
  last: { sequence: number; type: string } | undefined,
  message: string,
  timestamp: string = new Date().toISOString(),
): PlicoEvent[] {
  const events: PlicoEvent[] = [];
  let sequence = last?.sequence ?? 0;
  if (last?.type !== "run.error") {
    sequence += 1;
    events.push({
      schemaVersion: 1,
      streamType: "run",
      streamId: runId,
      runId,
      id: `evt-${String(sequence).padStart(4, "0")}`,
      sequence,
      timestamp,
      type: "run.error",
      payload: { phase: "runtime", message },
    });
  }
  sequence += 1;
  events.push({
    schemaVersion: 1,
    streamType: "run",
    streamId: runId,
    runId,
    id: `evt-${String(sequence).padStart(4, "0")}`,
    sequence,
    timestamp,
    type: "run.failed",
    payload: { phase: "runtime" },
  });
  return events;
}

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

  /** Skip previously persisted live chunks when replaying a model step. */
  skipModelDeltas(turn: number): void {
    while (this.#cursor < this.#replayed) {
      const event = this.#events[this.#cursor];
      if (
        (event?.type !== "model.delta" && event?.type !== "model.attempt") ||
        event.payload.turn !== turn
      )
        break;
      this.#cursor++;
    }
  }

  /** Continue after the recorded tail when recovery cannot replay the workflow. */
  continueAfterReplay(): void {
    this.#cursor = this.#replayed;
  }

  all(): PlicoEvent[] {
    return [...this.#events];
  }
}
