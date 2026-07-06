import type { ServerResponse } from "node:http";

export function initSSEStream(response: ServerResponse): void {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}

export function sendSSEEvent(
  response: ServerResponse,
  event: string,
  data: unknown,
  id?: string,
): void {
  if (id !== undefined) {
    response.write(`id: ${id}\n`);
  }
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function sendSSEHeartbeat(response: ServerResponse): void {
  response.write(": heartbeat\n\n");
}
