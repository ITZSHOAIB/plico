import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Thread, ThreadEvent, ThreadMessage } from "@plico/contracts";
import { type Metadata, matchesMetadata, parseMetadata } from "../metadata.js";
import { openDatabase } from "./open.js";
import { appendThreadEvent } from "./thread-log.js";
import { setGeneratedTitle, setUserTitle } from "./thread-title.js";

export interface ThreadStore {
  readonly storageIdentity?: string;
  /** Release resources owned by this store. */
  close(): void;
  createThread(metadata?: Metadata): Promise<Thread>;
  /** `metadata` keeps threads whose top-level keys equal every given value. */
  listThreads(filter?: { metadata?: Metadata }): Promise<Thread[]>;
  getThread(id: string): Promise<Thread | undefined>;
  /** Names a thread for the user. Returns undefined for an unknown thread. */
  renameThread(id: string, title: string): Promise<Thread | undefined>;
  /** Stores a title written after a reply. A title the user chose is never replaced. */
  setGeneratedTitle(id: string, title: string): Promise<boolean>;
  getThreadForRun(runId: string): Promise<string | undefined>;
  addMessage(
    threadId: string,
    content: string,
    runId?: string,
    recovery?: { providerKey: string; projectRoot: string; context?: Metadata },
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
      context?: Metadata;
      history: Array<Pick<ThreadMessage, "role" | "content">>;
    }>
  >;
}

const selectThread =
  "SELECT thread_id AS id, created_at AS createdAt, title, metadata_json AS metadataJson FROM threads";

function toThread(row: unknown): Thread {
  const { title, metadataJson, ...thread } = row as Thread & {
    title: string | null;
    metadataJson: string | null;
  };
  const metadata = parseMetadata(metadataJson);
  return {
    ...thread,
    ...(title === null ? {} : { title }),
    ...(metadata === undefined ? {} : { metadata }),
  };
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
    ...(databasePath === ":memory:"
      ? {}
      : {
          storageIdentity:
            process.platform === "win32"
              ? resolve(databasePath).toLowerCase()
              : resolve(databasePath),
        }),
    close() {
      db.close();
    },
    async createThread(metadata) {
      const thread: Thread = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...(metadata === undefined ? {} : { metadata }),
      };
      transaction(db, () => {
        appendThreadEvent(db, thread.id, "thread.created", { thread }, thread.createdAt);
        db.prepare(
          "INSERT INTO threads (thread_id, created_at, metadata_json) VALUES (?, ?, ?)",
        ).run(
          thread.id,
          thread.createdAt,
          metadata === undefined ? null : JSON.stringify(metadata),
        );
      });
      return thread;
    },
    async listThreads(filter) {
      return db
        .prepare(`${selectThread} ORDER BY created_at, rowid`)
        .all()
        .map(toThread)
        .filter((thread) => matchesMetadata(thread.metadata, filter?.metadata));
    },
    async getThread(id) {
      const row = db.prepare(`${selectThread} WHERE thread_id = ?`).get(id);
      return row === undefined ? undefined : toThread(row);
    },
    async renameThread(id, title) {
      const found = transaction(db, () => {
        if (!db.prepare("SELECT 1 FROM threads WHERE thread_id = ?").get(id)) return false;
        setUserTitle(db, id, title, new Date().toISOString());
        return true;
      });
      return found
        ? toThread(db.prepare(`${selectThread} WHERE thread_id = ?`).get(id))
        : undefined;
    },
    async setGeneratedTitle(id, title) {
      return transaction(db, () => setGeneratedTitle(db, id, title, new Date().toISOString()));
    },
    async getThreadForRun(runId) {
      const row = db.prepare("SELECT thread_id FROM thread_runs WHERE run_id = ?").get(runId) as
        | { thread_id: string }
        | undefined;
      return row?.thread_id;
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
            "INSERT INTO thread_runs (run_id, thread_id, provider_key, project_root, context_json) VALUES (?, ?, ?, ?, ?)",
          ).run(
            runId,
            threadId,
            recovery?.providerKey ?? null,
            recovery?.projectRoot ?? null,
            recovery?.context === undefined ? null : JSON.stringify(recovery.context),
          );
        const message: ThreadMessage = {
          id: randomUUID(),
          threadId,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
          ...(runId === undefined ? {} : { runId }),
        };
        const sequence = appendThreadEvent(
          db,
          threadId,
          "message.created",
          { message },
          message.createdAt,
        );
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
          "SELECT t.run_id AS runId, t.thread_id AS threadId, t.provider_key AS providerKey, t.project_root AS projectRoot, t.context_json AS contextJson, m.content, m.sequence FROM thread_runs t JOIN thread_messages m ON m.run_id = t.run_id AND m.role = 'user' LEFT JOIN runs r ON r.run_id = t.run_id WHERE r.run_id IS NULL",
        )
        .all() as unknown as Array<{
        runId: string;
        threadId: string;
        content: string;
        sequence: number;
        providerKey: string | null;
        projectRoot: string | null;
        contextJson: string | null;
      }>;
      return queued.map(({ sequence, contextJson, ...run }) => ({
        ...run,
        ...(contextJson === null ? {} : { context: parseMetadata(contextJson) as Metadata }),
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
