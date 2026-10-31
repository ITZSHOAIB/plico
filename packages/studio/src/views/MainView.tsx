import type {
  ArtifactFile,
  ArtifactWorkspace,
  ComposedInstructions,
  EvalCaseResult,
  EvalReport,
  LoadedProject,
  PlicoEvent,
  ReadinessReport,
  RunSummary,
} from "../types";
import type { View } from "../view";
import { ArtifactsView } from "./ArtifactsView";
import { EvalsView } from "./EvalsView";
import { InstructionsView } from "./InstructionsView";
import { OverviewView } from "./OverviewView";
import { ReadinessView } from "./ReadinessView";
import { RunView } from "./RunView";

interface MainViewProps {
  project: LoadedProject | null;
  runs: RunSummary[];
  view: View;
  selectedRun: RunSummary | null;
  events: PlicoEvent[];
  instructions: ComposedInstructions | null;
  workspace: ArtifactWorkspace | null;
  previewFile: ArtifactFile | null;
  onPreviewFile: (file: ArtifactFile | null) => void;
  evalReport: EvalReport | null;
  selectedEvalResult: EvalCaseResult | null;
  onSelectEvalResult: (result: EvalCaseResult | null) => void;
  onRunEvals: () => void;
  onOpenRun: (runId: string) => void;
  runningEvals: boolean;
  readinessReport: ReadinessReport | null;
  error: string | null;
}

export function MainView(props: MainViewProps) {
  if (props.error) {
    return <div style={{ padding: "16px", color: "#c00" }}>{props.error}</div>;
  }

  if (props.view === "overview") {
    return (
      <OverviewView
        project={props.project}
        runs={props.runs}
        instructions={props.instructions}
        evalReport={props.evalReport}
        readinessReport={props.readinessReport}
      />
    );
  }

  if (props.view === "instructions" && props.instructions) {
    return <InstructionsView instructions={props.instructions} />;
  }

  if (props.view === "evals") {
    return (
      <EvalsView
        report={props.evalReport}
        selected={props.selectedEvalResult}
        running={props.runningEvals}
        onSelect={props.onSelectEvalResult}
        onRun={props.onRunEvals}
        onOpenRun={props.onOpenRun}
      />
    );
  }

  if (props.view === "readiness") {
    return <ReadinessView report={props.readinessReport} />;
  }

  if (props.view === "artifacts") {
    return (
      <ArtifactsView
        selectedRun={props.selectedRun}
        workspace={props.workspace}
        previewFile={props.previewFile}
        onPreviewFile={props.onPreviewFile}
      />
    );
  }

  return <RunView selectedRun={props.selectedRun} events={props.events} />;
}
