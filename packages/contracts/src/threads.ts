export interface Thread {
  id: string;
  createdAt: string;
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
  | (ThreadEventEnvelope & { type: "message.created"; payload: { message: ThreadMessage } });
