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

/**
 * Stores a title a titler wrote after a reply. It never replaces a user's title and, like the
 * keyword titler, stops after the first exchanges. Returns whether the title changed.
 */
export function setGeneratedTitle(
  db: DatabaseSync,
  threadId: string,
  title: string,
  timestamp: string,
): boolean {
  const thread = db
    .prepare("SELECT title, title_source AS source FROM threads WHERE thread_id = ?")
    .get(threadId) as { title: string | null; source: string | null } | undefined;
  if (!thread || thread.source === "user" || thread.title === title) return false;
  const replies = db
    .prepare(
      "SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ? AND role = 'assistant'",
    )
    .get(threadId) as { count: number };
  if (replies.count > retitledExchanges) return false;
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
  // Count first: a frozen thread must not load its transcript on every reply.
  const replies = db
    .prepare(
      "SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ? AND role = 'assistant'",
    )
    .get(threadId) as { count: number };
  if (replies.count > retitledExchanges) return;
  const messages = db
    .prepare("SELECT role, content FROM thread_messages WHERE thread_id = ? ORDER BY sequence")
    .all(threadId) as Array<{ role: "user" | "assistant"; content: string }>;
  const title = suggestThreadTitle(messages);
  if (title === undefined || title === thread.title) return;
  db.prepare("UPDATE threads SET title = ?, title_source = 'generated' WHERE thread_id = ?").run(
    title,
    threadId,
  );
  appendThreadEvent(db, threadId, "thread.titled", { title, source: "generated" }, timestamp);
}
