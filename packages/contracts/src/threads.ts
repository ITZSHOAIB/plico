import type { JsonValue } from "./events.js";

export interface Thread {
  id: string;
  createdAt: string;
  /** Absent until the conversation has a topic or the user names it. */
  title?: string;
  /** Host data set at creation and never changed. */
  metadata?: Record<string, JsonValue>;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  runId?: string;
  content: string;
  createdAt: string;
}

interface ThreadEventEnvelope {
  schemaVersion: 1;
  streamType: "thread";
  streamId: string;
  sequence: number;
  id: string;
  timestamp: string;
}

export type ThreadEvent =
  | (ThreadEventEnvelope & { type: "thread.created"; payload: { thread: Thread } })
  | (ThreadEventEnvelope & { type: "message.created"; payload: { message: ThreadMessage } })
  | (ThreadEventEnvelope & {
      type: "thread.titled";
      payload: { title: string; source: "generated" | "user" };
    });
