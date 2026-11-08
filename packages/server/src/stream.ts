import type { IncomingMessage, ServerResponse } from "node:http";
import { followEvents } from "./app/events.js";
import { requireRun } from "./app/runs.js";
import type { AppDeps } from "./app/types.js";
import { HttpError } from "./errors.js";
import { initSSEStream, sendSSEEvent, sendSSEHeartbeat } from "./sse.js";

export interface HandleEventStreamOptions {
  app: AppDeps;
  /** Aborts when the host closes Plico. */
  stop: AbortSignal;
  request: IncomingMessage;
  response: ServerResponse;
  runId: string;
  afterSequence: number | undefined;
  heartbeatInterval?: number;
}

/** Writes a run's events as server-sent events until the run ends or the client leaves. */
export async function handleEventStream(options: HandleEventStreamOptions): Promise<void> {
  const { app, stop, request, response, runId, heartbeatInterval = 2000 } = options;

  await requireRun(app, runId);
  initSSEStream(response);

  const disconnected = new AbortController();
  request.on("close", () => disconnected.abort());
  const heartbeat = setInterval(() => sendSSEHeartbeat(response), heartbeatInterval);
  try {
    const events = followEvents(app, runId, {
      ...(options.afterSequence === undefined ? {} : { after: options.afterSequence }),
      signal: disconnected.signal,
      stop,
      pollMs: heartbeatInterval,
    });
    for await (const event of events) {
      sendSSEEvent(response, "plico.event", event, String(event.sequence));
    }
    sendSSEHeartbeat(response);
  } finally {
    clearInterval(heartbeat);
    response.end();
  }
}

export function parseAfterCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "cursor.invalid", `Malformed cursor: ${value}`);
  }

  return parsed;
}
