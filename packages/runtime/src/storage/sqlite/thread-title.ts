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

/** Names the thread from its transcript. Called inside the transaction that stores a reply. */
export function retitleThread(db: DatabaseSync, threadId: string, timestamp: string): void {
  const thread = db
    .prepare("SELECT title, title_source AS source FROM threads WHERE thread_id = ?")
    .get(threadId) as { title: string | null; source: string | null } | undefined;
  if (!thread || thread.source === "user") return;
  const messages = db
    .prepare("SELECT role, content FROM thread_messages WHERE thread_id = ? ORDER BY sequence")
    .all(threadId) as Array<{ role: "user" | "assistant"; content: string }>;
  if (messages.filter((message) => message.role === "assistant").length > retitledExchanges) return;
  const title = suggestThreadTitle(messages);
  if (title === undefined || title === thread.title) return;
  db.prepare("UPDATE threads SET title = ?, title_source = 'generated' WHERE thread_id = ?").run(
    title,
    threadId,
  );
  appendThreadEvent(db, threadId, "thread.titled", { title, source: "generated" }, timestamp);
}
