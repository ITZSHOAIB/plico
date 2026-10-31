import { EventList } from "../components/EventList";
import { emptyPanel, headingTight, metaLoose, panel } from "../styles";
import type { LoadedProject, PlicoEvent, RunSummary } from "../types";

interface RunViewProps {
  project: LoadedProject | null;
  selectedRun: RunSummary | null;
  events: PlicoEvent[];
}

export function RunView({ project, selectedRun, events }: RunViewProps) {
  if (!selectedRun) {
    return (
      <div style={emptyPanel}>
        {project ? `Project: ${project.config.name}. Select a run to inspect.` : "Loading project…"}
      </div>
    );
  }

  return (
    <div style={panel}>
      <h3 style={headingTight}>{selectedRun.runId}</h3>
      <div style={metaLoose}>
        Status: {selectedRun.status} | Started: {selectedRun.startedAt} | Ended:{" "}
        {selectedRun.endedAt}
      </div>
      <EventList events={events} />
    </div>
  );
}
