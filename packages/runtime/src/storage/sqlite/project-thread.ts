import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PlicoEvent, ThreadMessage } from "@plico-ai/contracts";
import { appendThreadEvent } from "./thread-log.js";
import { retitleThread } from "./thread-title.js";

/** Called inside the run event transaction so the transcript cannot lag behind its log. */
export function projectThreadEvent(db: DatabaseSync, event: PlicoEvent): void {
  if (event.type === "run.started" && event.payload.threadId) {
    const threadId = event.payload.threadId;
    if (!db.prepare("SELECT 1 FROM threads WHERE thread_id = ?").get(threadId))
      throw new Error("Unknown thread.");
    db.prepare("INSERT OR IGNORE INTO thread_runs (run_id, thread_id) VALUES (?, ?)").run(
      event.runId,
      threadId,
    );
    const linked = db
      .prepare("SELECT thread_id FROM thread_runs WHERE run_id = ?")
      .get(event.runId) as { thread_id: string };
    if (linked.thread_id !== threadId) throw new Error("Run already belongs to another thread.");
  }
  if (event.type !== "run.completed" || event.payload.output === undefined) return;
  const run = db.prepare("SELECT thread_id FROM thread_runs WHERE run_id = ?").get(event.runId) as
    | { thread_id: string }
    | undefined;
  if (!run) return;
  const message: ThreadMessage = {
    id: randomUUID(),
    threadId: run.thread_id,
    role: "assistant",
    content: event.payload.output,
    createdAt: event.timestamp,
    runId: event.runId,
  };
  const sequence = appendThreadEvent(
    db,
    run.thread_id,
    "message.created",
    { message },
    event.timestamp,
  );
  db.prepare(
    "INSERT INTO thread_messages (message_id, thread_id, role, content, created_at, sequence, run_id) VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
  ).run(message.id, run.thread_id, message.content, event.timestamp, sequence, event.runId);
  retitleThread(db, run.thread_id, event.timestamp);
}
