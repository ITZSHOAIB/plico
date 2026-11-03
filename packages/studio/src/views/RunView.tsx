import { useState } from "react";
import { EventList } from "../components/EventList";
import { useReplayPosition } from "../hooks/useReplayPosition";
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
import { ReplayControls } from "./ReplayControls";

interface RunViewProps {
  selectedRun: RunSummary | null;
  events: PlicoEvent[];
  streamState?: StreamState;
  eventsError?: string | null;
  eventsLoaded?: boolean;
}

export function RunView(props: RunViewProps) {
  if (!props.selectedRun) return <div style={emptyPanel}>Select a run to inspect.</div>;
  return <SelectedRunView {...props} selectedRun={props.selectedRun} />;
}

function SelectedRunView({
  selectedRun,
  events,
  streamState,
  eventsError,
  eventsLoaded = true,
}: RunViewProps & { selectedRun: RunSummary }) {
  const [mode, setMode] = useState<"timeline" | "raw">("timeline");
  const replay = useReplayPosition(selectedRun, events);
  const { visibleEvents, shownRun } = replay;
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
      <ReplayControls replay={replay} eventsLoaded={eventsLoaded} />
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
