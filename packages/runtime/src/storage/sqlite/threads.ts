import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Thread, ThreadEvent, ThreadMessage } from "@plico/contracts";
import { openDatabase } from "./open.js";

export interface ThreadStore {
  createThread(): Promise<Thread>;
  listThreads(): Promise<Thread[]>;
  getThread(id: string): Promise<Thread | undefined>;
  addMessage(threadId: string, content: string): Promise<ThreadMessage | undefined>;
  getMessages(threadId: string): Promise<ThreadMessage[]>;
  getEvents(threadId: string): Promise<ThreadEvent[]>;
}

export function createSqliteThreadStore({
  databasePath,
  readOnly = false,
}: {
  databasePath: string;
  readOnly?: boolean;
}): ThreadStore {
  const db = openDatabase(databasePath, readOnly);
  return {
    async createThread() {
      const thread: Thread = { id: randomUUID(), createdAt: new Date().toISOString() };
      transaction(db, () => {
        append(db, thread.id, "thread.created", { thread }, thread.createdAt);
        db.prepare("INSERT INTO threads (thread_id, created_at) VALUES (?, ?)").run(
          thread.id,
          thread.createdAt,
        );
      });
      return thread;
    },
    async listThreads() {
      return db
        .prepare(
          "SELECT thread_id AS id, created_at AS createdAt FROM threads ORDER BY created_at, rowid",
        )
        .all() as unknown as Thread[];
    },
    async getThread(id) {
      return db
        .prepare("SELECT thread_id AS id, created_at AS createdAt FROM threads WHERE thread_id = ?")
        .get(id) as unknown as Thread | undefined;
    },
    async addMessage(threadId, content) {
      return transaction(db, () => {
        if (!db.prepare("SELECT 1 FROM threads WHERE thread_id = ?").get(threadId))
          return undefined;
        const message: ThreadMessage = {
          id: randomUUID(),
          threadId,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
        };
        const sequence = append(db, threadId, "message.created", { message }, message.createdAt);
        db.prepare(
          "INSERT INTO thread_messages (message_id, thread_id, role, content, created_at, sequence) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(message.id, threadId, message.role, content, message.createdAt, sequence);
        return message;
      });
    },
    async getMessages(threadId) {
      return db
        .prepare(
          "SELECT message_id AS id, thread_id AS threadId, role, content, created_at AS createdAt FROM thread_messages WHERE thread_id = ? ORDER BY sequence",
        )
        .all(threadId) as unknown as ThreadMessage[];
    },
    async getEvents(threadId) {
      const rows = db
        .prepare(
          "SELECT sequence, event_id, schema_version, type, timestamp, payload_json FROM events WHERE stream_type = 'thread' AND stream_id = ? ORDER BY sequence",
        )
        .all(threadId) as unknown as Array<{
        sequence: number;
        event_id: string;
        schema_version: number;
        type: ThreadEvent["type"];
        timestamp: string;
        payload_json: string;
      }>;
      return rows.map((row) => {
        if (row.schema_version !== 1)
          throw new Error(`Unsupported thread event schema version: ${row.schema_version}.`);
        return {
          schemaVersion: 1,
          streamType: "thread",
          streamId: threadId,
          sequence: row.sequence,
          id: row.event_id,
          type: row.type,
          timestamp: row.timestamp,
          payload: JSON.parse(row.payload_json),
        } as ThreadEvent;
      });
    },
  };
}

function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function append(
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
