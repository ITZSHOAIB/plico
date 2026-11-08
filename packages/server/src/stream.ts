import { followEvents } from "./app/events.js";
import { requireRun } from "./app/runs.js";
import type { AppDeps } from "./app/types.js";
import { HttpError } from "./errors.js";
import { sseEvent, sseHeaders, sseHeartbeat } from "./sse.js";

export interface EventStreamOptions {
  app: AppDeps;
  /** Aborts when the host closes Plico. */
  stop: AbortSignal;
  request: Request;
  runId: string;
  afterSequence: number | undefined;
  heartbeatInterval?: number;
}

/** Answers with a run's events as server-sent events until the run ends or the client leaves. */
export async function eventStreamResponse(options: EventStreamOptions): Promise<Response> {
  const { app, stop, request, runId, heartbeatInterval = 2000 } = options;

  await requireRun(app, runId);

  const cancelled = new AbortController();
  const disconnected = AbortSignal.any([request.signal, cancelled.signal]);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // The client already left.
        }
      };
      const heartbeat = setInterval(() => write(sseHeartbeat()), heartbeatInterval);
      void (async () => {
        try {
          const events = followEvents(app, runId, {
            ...(options.afterSequence === undefined ? {} : { after: options.afterSequence }),
            signal: disconnected,
            stop,
            pollMs: heartbeatInterval,
          });
          for await (const event of events) {
            write(sseEvent("plico.event", event, String(event.sequence)));
          }
          write(sseHeartbeat());
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        }
      })();
    },
    cancel() {
      cancelled.abort();
    },
  });
  return new Response(body, { headers: sseHeaders });
}

export function parseAfterCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "cursor.invalid", `Malformed cursor: ${value}`);
  }

  return parsed;
}
