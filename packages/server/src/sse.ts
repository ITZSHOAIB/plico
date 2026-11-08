const encoder = new TextEncoder();

export const sseHeaders: Record<string, string> = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
};

export function sseEvent(event: string, data: unknown, id?: string): Uint8Array {
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  return encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function sseHeartbeat(): Uint8Array {
  return encoder.encode(": heartbeat\n\n");
}
