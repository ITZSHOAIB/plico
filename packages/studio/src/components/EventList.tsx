import { useState } from "react";
import type { PlicoEvent } from "../types";

export function EventList({ events }: { events: PlicoEvent[] }) {
  return (
    <div>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}

function EventRow({ event }: { event: PlicoEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: "4px", border: "1px solid #eee", borderRadius: "3px" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          gap: "8px",
          width: "100%",
          padding: "4px 8px",
          cursor: "pointer",
          background: "#fafafa",
          fontSize: "12px",
          border: "none",
          textAlign: "left",
          fontFamily: "inherit",
          color: "inherit",
        }}
      >
        <span style={{ color: "#999", minWidth: "24px" }}>{event.sequence}</span>
        <span style={{ fontWeight: 500, minWidth: "140px" }}>{event.type}</span>
        <span style={{ color: "#999", fontSize: "11px" }}>{event.timestamp}</span>
      </button>
      {expanded && (
        <div style={{ padding: "4px 8px 8px", fontSize: "12px" }}>
          <ToolEventDetail event={event} />
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f9f9f9",
              padding: "4px",
              borderRadius: "2px",
              margin: "4px 0 0",
              fontSize: "11px",
            }}
          >
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolEventDetail({ event }: { event: PlicoEvent }) {
  if (
    event.type === "tool.call" ||
    event.type === "tool.result" ||
    event.type === "approval.required"
  ) {
    const toolName = String(event.payload.toolName ?? "");
    const details: string[] = [];
    if (toolName) details.push(`tool: ${toolName}`);
    if (event.type === "approval.required") {
      details.push("requires approval");
    }
    if (details.length > 0) {
      return <div style={{ marginBottom: "4px" }}>{details.join(" | ")}</div>;
    }
  }
  return null;
}
