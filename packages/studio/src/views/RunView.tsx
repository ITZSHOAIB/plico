import { useState } from "react";
import { EventList } from "../components/EventList";
import { statusAfter } from "../hooks/runState";
import type { StreamState } from "../hooks/useRunStream";
import {
  codeBlockScroll,
  emptyPanel,
  headingTight,
  metaLoose,
  panel,
  toolbarButton,
} from "../styles";
import type { PlicoEvent, RunSummary } from "../types";

interface RunViewProps {
  selectedRun: RunSummary | null;
  events: PlicoEvent[];
  streamState?: StreamState;
  eventsError?: string | null;
}

export function RunView({ selectedRun, events, streamState, eventsError }: RunViewProps) {
  const [mode, setMode] = useState<"timeline" | "raw">("timeline");
  const [position, setPosition] = useState<number | null>(null);

  if (!selectedRun) {
    return <div style={emptyPanel}>Select a run to inspect.</div>;
  }
  const index = position === null ? events.length - 1 : Math.min(position, events.length - 1);
  const visibleEvents = events.slice(0, index + 1);
  const shownRun =
    position === null
      ? selectedRun
      : visibleEvents.reduce(statusAfter, { ...selectedRun, status: "running", endedAt: null });
  const error = [...visibleEvents].reverse().find((event) => event.type === "run.error");
  const reason =
    error?.payload.message ?? error?.payload.issues?.map((issue) => issue.message).join(", ");

  return (
    <div style={panel}>
      <h3 style={headingTight}>{selectedRun.runId}</h3>
      <div style={metaLoose}>
        Status: {shownRun.status} | Started: {shownRun.startedAt} | Ended:{" "}
        {shownRun.endedAt ?? "Not ended"}
      </div>
      {eventsError && <div role="alert">{eventsError}</div>}
      {streamState === "disconnected" && (
        <div role="alert">Disconnected from run updates. Reselect the run to retry.</div>
      )}
      {streamState === "reconnecting" && <div role="status">Reconnecting to run updates...</div>}
      {shownRun.status === "failed" && reason && <div>Failure: {reason}</div>}
      <section aria-label="Run replay" style={{ marginBottom: "8px" }}>
        <button
          type="button"
          onClick={() => setPosition(Math.max(0, index - 1))}
          disabled={index <= 0}
        >
          Previous event
        </button>
        <button
          type="button"
          onClick={() => setPosition(index + 1 >= events.length - 1 ? null : index + 1)}
          disabled={index >= events.length - 1}
        >
          Next event
        </button>
        <button type="button" onClick={() => setPosition(null)} disabled={position === null}>
          Go to latest
        </button>
        <span>
          {" "}
          Event {index + 1} of {events.length}
        </span>
        {position !== null && index < events.length - 1 && (
          <span> ({events.length - index - 1} newer)</span>
        )}
      </section>
      <div style={{ marginBottom: "8px" }}>
        <button
          type="button"
          onClick={() => setMode("timeline")}
          style={toolbarButton(mode === "timeline")}
        >
          Timeline
        </button>
        <button type="button" onClick={() => setMode("raw")} style={toolbarButton(mode === "raw")}>
          Raw events
        </button>
      </div>
      {mode === "timeline" ? (
        <EventList events={visibleEvents} />
      ) : (
        <section aria-label="Raw events">
          <pre style={codeBlockScroll("75vh")}>{JSON.stringify(visibleEvents, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
