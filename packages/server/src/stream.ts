import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore, PlicoEventType, RunStatus } from "@plico/runtime";
import { HttpError, sendError } from "./errors.js";
import { initSSEStream, sendSSEEvent, sendSSEHeartbeat } from "./sse.js";

const TERMINAL_EVENT_TYPES: readonly PlicoEventType[] = [
  "run.completed",
  "run.failed",
  "run.blocked",
  "run.error",
  "run.cancelled",
];

const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["completed", "failed", "blocked", "cancelled"];

function isTerminalEventType(type: string): boolean {
  return (TERMINAL_EVENT_TYPES as readonly string[]).includes(type);
}

function isTerminalRunStatus(status: RunStatus): boolean {
  return (TERMINAL_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

export interface HandleEventStreamOptions {
  projectRoot: string;
  eventStore: EventStore;
  request: IncomingMessage;
  response: ServerResponse;
  runId: string;
  afterSequence: number | undefined;
  heartbeatInterval?: number;
}

export async function handleEventStream(options: HandleEventStreamOptions): Promise<void> {
  const { eventStore, request, response, runId, heartbeatInterval = 2000 } = options;

  const run = await eventStore.getRun(runId);
  if (!run) {
    sendError(response, 404, "run.not_found", `Unknown run ID: ${runId}`);
    return;
  }

  const cursor = options.afterSequence ?? 0;
  initSSEStream(response);

  request.on("close", () => {
    response.end();
  });

  let currentSequence = cursor;
  let closed = false;

  while (!closed) {
    const events = await eventStore.getEvents(runId, { afterSequence: currentSequence });

    for (const event of events) {
      sendSSEEvent(response, "plico.event", event, String(event.sequence));
      currentSequence = event.sequence;
    }

    const hasTerminalEvent = events.some((e) => isTerminalEventType(e.type));
    if (hasTerminalEvent) {
      closed = true;
    }

    sendSSEHeartbeat(response);

    if (closed) {
      break;
    }

    const currentRun = await eventStore.getRun(runId);
    if (currentRun && isTerminalRunStatus(currentRun.status)) {
      break;
    }

    await sleep(heartbeatInterval);

    if (request.destroyed) {
      return;
    }
  }

  response.end();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseAfterCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "cursor.invalid", `Malformed cursor: ${value}`);
  }

  return parsed;
}
