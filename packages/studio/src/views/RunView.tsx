import { useState } from "react";
import { EventList } from "../components/EventList";
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
}

export function RunView({ selectedRun, events }: RunViewProps) {
  const [mode, setMode] = useState<"timeline" | "raw">("timeline");

  if (!selectedRun) {
    return <div style={emptyPanel}>Select a run to inspect.</div>;
  }
  const error = [...events].reverse().find((event) => event.type === "run.error");
  const reason =
    error?.payload.message ?? error?.payload.issues?.map((issue) => issue.message).join(", ");

  return (
    <div style={panel}>
      <h3 style={headingTight}>{selectedRun.runId}</h3>
      <div style={metaLoose}>
        Status: {selectedRun.status} | Started: {selectedRun.startedAt} | Ended:{" "}
        {selectedRun.endedAt ?? "Not ended"}
      </div>
      {selectedRun.status === "failed" && reason && <div>Failure: {reason}</div>}
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
        <EventList events={events} />
      ) : (
        <section aria-label="Raw events">
          <pre style={codeBlockScroll("75vh")}>{JSON.stringify(events, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
