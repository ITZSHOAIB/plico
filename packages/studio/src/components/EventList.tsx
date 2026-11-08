import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type { PlicoEvent } from "../types";

/** One timeline row: a single event, or a run of consecutive streamed text chunks. */
interface Row {
  key: string;
  type: PlicoEvent["type"];
  first: PlicoEvent;
  last: PlicoEvent;
  chunks?: number;
  summary: string | undefined;
  details: string;
}

export function EventList({ events }: { events: PlicoEvent[] }) {
  return (
    <ul className="m-0 list-none p-0 font-mono text-small">
      {toRows(events).map((row) => (
        <EventRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

function toRows(events: PlicoEvent[]): Row[] {
  const rows: Row[] = [];
  for (const event of events) {
    const previous = rows.at(-1);
    if (event.type === "model.delta") {
      if (previous?.chunks && previous.last.type === "model.delta") {
        previous.last = event;
        previous.chunks += 1;
        previous.summary = `${previous.summary ?? ""}${event.payload.text}`;
        previous.details = previous.summary;
        continue;
      }
      rows.push({
        key: event.id,
        type: event.type,
        first: event,
        last: event,
        chunks: 1,
        summary: event.payload.text,
        details: event.payload.text,
      });
      continue;
    }
    rows.push({
      key: event.id,
      type: event.type,
      first: event,
      last: event,
      summary: eventSummary(event),
      details: JSON.stringify(event.payload, null, 2),
    });
  }
  return rows;
}

function EventRow({ row }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const range =
    row.first.sequence === row.last.sequence
      ? String(row.first.sequence)
      : `${row.first.sequence}–${row.last.sequence}`;

  return (
    <li className="border-b border-line-subtle">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
        onClick={() => setExpanded(!expanded)}
        className="group grid w-full cursor-pointer grid-cols-[0.75rem_3.25rem_1fr] items-baseline gap-x-2 gap-y-0.5 border-0 bg-transparent py-2 pr-4 pl-3 text-left text-inherit transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-expanded:bg-raised sm:grid-cols-[0.75rem_3.25rem_10.5rem_1fr_auto]"
      >
        <ChevronRight
          size={12}
          aria-hidden="true"
          className="self-center text-faint transition-transform group-aria-expanded:rotate-90"
        />
        <span className="text-right text-faint tabular-nums">{range}</span>
        <span className={`flex min-w-0 items-center gap-1.5 font-medium ${typeTone(row.type)}`}>
          <span className="truncate">{row.type}</span>
          {row.chunks && row.chunks > 1 && (
            <span className="shrink-0 rounded bg-accent-soft px-1 text-caption font-normal text-accent">
              {row.chunks} chunks
            </span>
          )}
        </span>
        <span className="col-start-3 truncate font-sans text-muted sm:col-start-auto">
          {row.summary}
        </span>
        <time
          dateTime={row.last.timestamp}
          title={row.last.timestamp}
          className="col-start-3 text-caption text-faint tabular-nums sm:col-start-auto"
        >
          {clockTime(row.last.timestamp)}
        </time>
      </button>
      {expanded && (
        <pre
          id={detailsId}
          className="m-0 mx-4 mb-3 overflow-x-auto rounded-panel border border-line bg-code-bg p-3 whitespace-pre-wrap text-code-string"
        >
          {row.details}
        </pre>
      )}
    </li>
  );
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

function typeTone(type: PlicoEvent["type"]): string {
  if (type.startsWith("tool.") || type.startsWith("approval.")) return "text-accent";
  if (type === "run.completed") return "text-success";
  if (type === "run.failed" || type === "run.error") return "text-danger";
  if (type === "run.cancelled" || type === "run.waiting") return "text-warning";
  return "text-fg";
}

function eventSummary(event: PlicoEvent): string | undefined {
  if (event.type === "model.request" && event.payload.model)
    return `${event.payload.model.provider} / ${event.payload.model.name}`;
  if (event.type === "model.response" && event.payload.usage)
    return `${event.payload.usage.inputTokens} input tokens · ${event.payload.usage.outputTokens} output tokens`;
  if (event.type === "assistant.output") return event.payload.content;
  if (event.type === "approval.requested") return `${event.payload.toolName} requires approval`;
  if (event.type === "approval.decided")
    return `Approval ${event.payload.approved ? "approved" : "denied"}`;
  if (event.type === "tool.call" || event.type === "tool.result") return event.payload.toolName;
  return undefined;
}
