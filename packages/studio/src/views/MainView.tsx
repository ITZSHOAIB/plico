import type { EvalsState } from "../hooks/useEvals";
import type { ProjectData } from "../hooks/useProjectData";
import type { RunInspector } from "../hooks/useRunInspector";
import { EmptyState } from "../ui/Page";
import type { View } from "../view";
import { ArtifactsView } from "./ArtifactsView";
import { ChatView } from "./ChatView";
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
  onBackToRuns: () => void;
}

export function MainView({ view, data, inspector, evals, onOpenRun, onBackToRuns }: MainViewProps) {
  if (data.error) {
    return <EmptyState alert>{data.error}</EmptyState>;
  }

  if (view === "chat") return <ChatView inspector={inspector} />;

  if (view === "overview") {
    return <OverviewView data={data} evalReport={evals.report} />;
  }

  if (view === "instructions") {
    if (data.instructionsError) return <EmptyState alert>{data.instructionsError}</EmptyState>;
    return data.instructions ? (
      <InstructionsView instructions={data.instructions} />
    ) : (
      <EmptyState>Loading instructions…</EmptyState>
    );
  }

  if (view === "evals") {
    return <EvalsView evals={evals} onOpenRun={onOpenRun} />;
  }

  if (view === "readiness") {
    return <ReadinessView report={data.readiness} error={data.readinessError} />;
  }

  if (view === "artifacts") {
    return (
      <ArtifactsView
        key={`${inspector.selectedRun?.runId}-${inspector.workspaceKey}`}
        {...inspector}
        onPreviewFile={inspector.setPreviewFile}
      />
    );
  }

  return (
    <RunView
      key={inspector.selectionKey}
      selectedRun={inspector.selectedRun}
      events={inspector.events}
      streamState={inspector.streamState}
      eventsError={inspector.eventsError}
      eventsLoaded={inspector.eventsLoaded}
      onBack={onBackToRuns}
    />
  );
}
