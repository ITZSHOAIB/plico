import type { EvalsState } from "../hooks/useEvals";
import type { ProjectData } from "../hooks/useProjectData";
import type { RunInspector } from "../hooks/useRunInspector";
import type { View } from "../view";
import { ArtifactsView } from "./ArtifactsView";
import { EvalsView } from "./EvalsView";
import { InstructionsView } from "./InstructionsView";
import { OverviewView } from "./OverviewView";
import { ReadinessView } from "./ReadinessView";
import { RunView } from "./RunView";

interface MainViewProps {
  view: View;
  data: ProjectData;
  inspector: RunInspector;
  evals: EvalsState;
  onOpenRun: (runId: string) => void;
}

export function MainView({ view, data, inspector, evals, onOpenRun }: MainViewProps) {
  if (data.error) {
    return <div style={{ padding: "16px", color: "#c00" }}>{data.error}</div>;
  }

  if (view === "overview") {
    return <OverviewView data={data} evalReport={evals.report} />;
  }

  if (view === "instructions" && data.instructions) {
    return <InstructionsView instructions={data.instructions} />;
  }

  if (view === "evals") {
    return <EvalsView evals={evals} onOpenRun={onOpenRun} />;
  }

  if (view === "readiness") {
    return <ReadinessView report={data.readiness} />;
  }

  if (view === "artifacts") {
    return <ArtifactsView {...inspector} onPreviewFile={inspector.setPreviewFile} />;
  }

  return <RunView selectedRun={inspector.selectedRun} events={inspector.events} />;
}
