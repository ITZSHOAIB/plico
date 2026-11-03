import { useState } from "react";
import type { PlicoEvent } from "../types";

export function EventList({ events }: { events: PlicoEvent[] }) {
  return (
    <ul className="m-0 list-none p-0 font-mono text-xs">
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </ul>
  );
}

function EventRow({ event }: { event: PlicoEvent }) {
  const [expanded, setExpanded] = useState(false);
  const summary = eventSummary(event);

  return (
    <li className="border-b border-line-subtle">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="grid w-full cursor-pointer grid-cols-[2rem_1fr] items-baseline gap-x-3 gap-y-0.5 bg-transparent px-4 py-1.5 text-left text-inherit hover:bg-raised aria-expanded:bg-raised sm:grid-cols-[2rem_11rem_1fr_auto]"
      >
        <span className="text-right text-faint tabular-nums">{event.sequence}</span>
        <span className={`font-semibold ${typeTone(event.type)}`}>{event.type}</span>
        <span className="col-start-2 truncate text-muted sm:col-start-auto">{summary}</span>
        <span className="col-start-2 text-[11px] text-faint sm:col-start-auto">
          {event.timestamp}
        </span>
      </button>
      {expanded && (
        <pre className="m-0 mx-4 mb-2 overflow-x-auto whitespace-pre-wrap rounded-panel border border-line bg-bg p-3 text-code-string">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </li>
  );
}

function typeTone(type: PlicoEvent["type"]): string {
  if (type.startsWith("tool.") || type.startsWith("approval.")) return "text-accent";
  if (type === "run.completed") return "text-success";
  if (type === "run.failed" || type === "run.error") return "text-danger";
  return "text-fg";
}

function eventSummary(event: PlicoEvent): string | undefined {
  if (event.type === "approval.requested") return `${event.payload.toolName} requires approval`;
  if (event.type === "tool.call" || event.type === "tool.result") return event.payload.toolName;
  return undefined;
}
