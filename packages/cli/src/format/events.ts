import type { PlicoEvent } from "@plico/runtime";

export function formatEvents(runId: string, events: PlicoEvent[]): string[] {
  const lines = [`Events for ${runId}`];

  for (const event of events) {
    lines.push(`${event.sequence} ${event.type} ${JSON.stringify(event.payload)}`);
  }

  return lines;
}
