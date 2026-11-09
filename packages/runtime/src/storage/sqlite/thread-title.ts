import type { DatabaseSync } from "node:sqlite";
import { suggestThreadTitle } from "../../threads/suggest-title.js";
import { appendThreadEvent } from "./thread-log.js";

/** A thread is retitled after each of its first exchanges, then the title is left alone. */
const retitledExchanges = 3;

/** Sets the title a user chose. It is never replaced by a generated one afterwards. */
export function setUserTitle(
  db: DatabaseSync,
  threadId: string,
  title: string,
  timestamp: string,
): void {
  db.prepare("UPDATE threads SET title = ?, title_source = 'user' WHERE thread_id = ?").run(
    title,
    threadId,
  );
  appendThreadEvent(db, threadId, "thread.titled", { title, source: "user" }, timestamp);
}

/** The transcript a titler should name, and the revision a title written from it belongs to. */
export interface TitleRequest {
  revision: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function messageCount(db: DatabaseSync, threadId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?")
    .get(threadId) as { count: number };
  return row.count;
}

function isFrozen(db: DatabaseSync, threadId: string): boolean {
  const thread = db
    .prepare("SELECT title_source AS source FROM threads WHERE thread_id = ?")
    .get(threadId) as { source: string | null } | undefined;
  if (!thread || thread.source === "user") return true;
  // Count first: a frozen thread must not load its transcript on every reply.
  const replies = db
    .prepare(
      "SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ? AND role = 'assistant'",
    )
    .get(threadId) as { count: number };
  return replies.count > retitledExchanges;
}

/** The transcript to title now, or nothing when the thread is user-titled or past its exchanges. */
export function getTitleRequest(db: DatabaseSync, threadId: string): TitleRequest | undefined {
  if (isFrozen(db, threadId)) return undefined;
  const messages = db
    .prepare("SELECT role, content FROM thread_messages WHERE thread_id = ? ORDER BY sequence")
    .all(threadId) as TitleRequest["messages"];
  return { revision: messageCount(db, threadId), messages };
}

/**
 * Stores a title a titler wrote after a reply. It never replaces a user's title, stops after the
 * first exchanges like the keyword titler, and rejects a title written from an older transcript
 * than the one behind the stored title. Returns whether the title changed.
 */
export function setGeneratedTitle(
  db: DatabaseSync,
  threadId: string,
  title: string,
  revision: number,
  timestamp: string,
): boolean {
  const thread = db
    .prepare(
      "SELECT title, title_revision AS stored FROM threads WHERE thread_id = ? AND title_source IS NOT 'user'",
    )
    .get(threadId) as { title: string | null; stored: number } | undefined;
  if (!thread || isFrozen(db, threadId) || revision < thread.stored) return false;
  db.prepare("UPDATE threads SET title_revision = ? WHERE thread_id = ?").run(revision, threadId);
  if (thread.title === title) return false;
  db.prepare("UPDATE threads SET title = ?, title_source = 'generated' WHERE thread_id = ?").run(
    title,
    threadId,
  );
  appendThreadEvent(db, threadId, "thread.titled", { title, source: "generated" }, timestamp);
  return true;
}

/**
 * Names the thread from its transcript. Called inside the transaction that stores a reply, where
 * a title is only a convenience: if naming fails, the reply is still stored and the run completes.
 */
export function retitleThread(db: DatabaseSync, threadId: string, timestamp: string): void {
  db.exec("SAVEPOINT retitle");
  try {
    nameThread(db, threadId, timestamp);
  } catch {
    db.exec("ROLLBACK TO retitle");
  } finally {
    db.exec("RELEASE retitle");
  }
}

function nameThread(db: DatabaseSync, threadId: string, timestamp: string): void {
  const thread = db
    .prepare("SELECT title, title_source AS source FROM threads WHERE thread_id = ?")
    .get(threadId) as { title: string | null; source: string | null } | undefined;
  if (!thread || thread.source === "user") return;
  const request = getTitleRequest(db, threadId);
  if (!request) return;
  const title = suggestThreadTitle(request.messages);
  if (title === undefined || title === thread.title) return;
  db.prepare(
    "UPDATE threads SET title = ?, title_source = 'generated', title_revision = ? WHERE thread_id = ?",
  ).run(title, request.revision, threadId);
  appendThreadEvent(db, threadId, "thread.titled", { title, source: "generated" }, timestamp);
}
