import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Thread, ThreadEvent, ThreadMessage } from "@plico/contracts";
import { openDatabase } from "./open.js";

export interface ThreadStore {
  /** Release resources owned by this store. */
  close(): void;
  createThread(): Promise<Thread>;
  listThreads(): Promise<Thread[]>;
  getThread(id: string): Promise<Thread | undefined>;
  addMessage(
    threadId: string,
    content: string,
    runId?: string,
    recovery?: { providerKey: string; projectRoot: string },
  ): Promise<ThreadMessage | undefined>;
  getMessages(threadId: string): Promise<ThreadMessage[]>;
  getEvents(threadId: string): Promise<ThreadEvent[]>;
  listQueuedRuns(): Promise<
    Array<{
      runId: string;
      threadId: string;
      content: string;
      providerKey: string | null;
      projectRoot: string | null;
      history: Array<Pick<ThreadMessage, "role" | "content">>;
    }>
  >;
}

export class ThreadBusyError extends Error {
  constructor() {
    super("Thread already has an active run.");
    this.name = "ThreadBusyError";
  }
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
    close() {
      db.close();
    },
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
    async addMessage(threadId, content, runId, recovery) {
      return transaction(db, () => {
        if (!db.prepare("SELECT 1 FROM threads WHERE thread_id = ?").get(threadId))
          return undefined;
        if (
          db
            .prepare(
              "SELECT 1 FROM thread_runs t LEFT JOIN runs r ON r.run_id = t.run_id WHERE t.thread_id = ? AND (r.status IS NULL OR r.status IN ('running', 'waiting')) LIMIT 1",
            )
            .get(threadId)
        )
          throw new ThreadBusyError();
        if (runId !== undefined)
          db.prepare(
            "INSERT INTO thread_runs (run_id, thread_id, provider_key, project_root) VALUES (?, ?, ?, ?)",
          ).run(runId, threadId, recovery?.providerKey ?? null, recovery?.projectRoot ?? null);
        const message: ThreadMessage = {
          id: randomUUID(),
          threadId,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
          ...(runId === undefined ? {} : { runId }),
        };
        const sequence = append(db, threadId, "message.created", { message }, message.createdAt);
        db.prepare(
          "INSERT INTO thread_messages (message_id, thread_id, role, content, created_at, sequence, run_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(
          message.id,
          threadId,
          message.role,
          content,
          message.createdAt,
          sequence,
          runId ?? null,
        );
        return message;
      });
    },
    async getMessages(threadId) {
      return db
        .prepare(
          "SELECT message_id AS id, thread_id AS threadId, role, content, created_at AS createdAt, run_id AS runId FROM thread_messages WHERE thread_id = ? ORDER BY sequence",
        )
        .all(threadId)
        .map(({ runId, ...message }) => ({
          ...message,
          ...(runId === null ? {} : { runId }),
        })) as unknown as ThreadMessage[];
    },
    async listQueuedRuns() {
      const queued = db
        .prepare(
          "SELECT t.run_id AS runId, t.thread_id AS threadId, t.provider_key AS providerKey, t.project_root AS projectRoot, m.content, m.sequence FROM thread_runs t JOIN thread_messages m ON m.run_id = t.run_id AND m.role = 'user' LEFT JOIN engine_runs e ON e.run_id = t.run_id LEFT JOIN runs r ON r.run_id = t.run_id WHERE e.run_id IS NULL AND r.run_id IS NULL",
        )
        .all() as unknown as Array<{
        runId: string;
        threadId: string;
        content: string;
        sequence: number;
        providerKey: string | null;
        projectRoot: string | null;
      }>;
      return queued.map(({ sequence, ...run }) => ({
        ...run,
        history: db
          .prepare(
            "SELECT role, content FROM thread_messages WHERE thread_id = ? AND sequence < ? ORDER BY sequence",
          )
          .all(run.threadId, sequence) as unknown as Array<Pick<ThreadMessage, "role" | "content">>,
      }));
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
