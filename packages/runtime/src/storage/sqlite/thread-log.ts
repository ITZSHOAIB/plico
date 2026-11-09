import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ThreadEvent } from "@plico-ai/contracts";

/** Appends to a thread's own event stream and returns the new sequence number. */
export function appendThreadEvent(
  db: DatabaseSync,
  threadId: string,
  type: ThreadEvent["type"],
  payload: unknown,
  timestamp: string,
): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM events WHERE stream_type = 'thread' AND stream_id = ?",
    )
    .get(threadId) as { next: number };
  db.prepare(
    "INSERT INTO events (stream_type, stream_id, sequence, event_id, schema_version, type, timestamp, payload_json) VALUES ('thread', ?, ?, ?, 1, ?, ?, ?)",
  ).run(threadId, row.next, randomUUID(), type, timestamp, JSON.stringify(payload));
  return row.next;
}
