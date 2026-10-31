import type {
  ArtifactFile,
  ArtifactWorkspace,
  ComposedInstructions,
  EvalCaseResult,
  EvalSummary,
  LoadedProject,
  PlicoEvent,
  ReadinessReport,
  RunSummary,
} from "../types";
import type { View } from "../view";
import { ArtifactsView } from "./ArtifactsView";
import { EvalsView } from "./EvalsView";
import { InstructionsView } from "./InstructionsView";
import { ReadinessView } from "./ReadinessView";
import { RunView } from "./RunView";

interface MainViewProps {
  project: LoadedProject | null;
  view: View;
  selectedRun: RunSummary | null;
  events: PlicoEvent[];
  instructions: ComposedInstructions | null;
  workspace: ArtifactWorkspace | null;
  previewFile: ArtifactFile | null;
  onPreviewFile: (file: ArtifactFile | null) => void;
  evalSummary: EvalSummary | null;
  selectedEvalResult: EvalCaseResult | null;
  onSelectEvalRun: (result: EvalCaseResult) => void;
  readinessReport: ReadinessReport | null;
  error: string | null;
}

export function MainView(props: MainViewProps) {
  if (props.error) {
    return <div style={{ padding: "16px", color: "#c00" }}>{props.error}</div>;
  }

  if (props.view === "instructions" && props.instructions) {
    return <InstructionsView instructions={props.instructions} />;
  }

  if (props.view === "evals") {
    return (
      <EvalsView
        summary={props.evalSummary}
        selected={props.selectedEvalResult}
        onSelect={props.onSelectEvalRun}
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

  return <RunView project={props.project} selectedRun={props.selectedRun} events={props.events} />;
}
