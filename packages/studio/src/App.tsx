import { useCallback, useState } from "react";
import { fetchRun } from "./api";
import { Sidebar } from "./components/Sidebar";
import { useEvals } from "./hooks/useEvals";
import { useProjectData } from "./hooks/useProjectData";
import { useRunInspector } from "./hooks/useRunInspector";
import type { RunSummary } from "./types";
import type { View } from "./view";
import { MainView } from "./views/MainView";

export function App() {
  const data = useProjectData();
  const { loadRuns, loadReadiness } = data;
  const onEvalsFinished = useCallback(
    async () => void (await Promise.all([loadRuns(), loadReadiness()])),
    [loadRuns, loadReadiness],
  );
  const evals = useEvals(onEvalsFinished);
  const inspector = useRunInspector();
  const [view, setView] = useState<View>("overview");

  const selectRun = (run: RunSummary) => {
    setView("runs");
    evals.select(null);
    return inspector.selectRun(run);
  };

  // The run may be newer than the sidebar list, for example after a terminal plico eval.
  const openRun = async (runId: string) => {
    try {
      await selectRun(await fetchRun(runId));
      await loadRuns();
    } catch {
      evals.setError(`Failed to open run ${runId}`);
    }
  };

  const showTopLevelView = (next: View) => {
    setView(next);
    inspector.clear();
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
      }}
    >
      <Sidebar
        project={data.project}
        runs={data.runs}
        selectedRun={inspector.selectedRun}
        view={view}
        onSelectRun={selectRun}
        onShowOverview={() => showTopLevelView("overview")}
        onShowInstructions={() => showTopLevelView("instructions")}
        onShowRuns={() => showTopLevelView("runs")}
        onShowArtifacts={() => {
          if (!inspector.selectedRun) return;
          setView("artifacts");
          void inspector.loadWorkspace(inspector.selectedRun.runId);
        }}
        onShowEvals={() => {
          setView("evals");
          evals.select(null);
          evals.setError(null);
          void evals.refresh();
          void loadRuns();
        }}
        onShowReadiness={() => {
          setView("readiness");
          void loadReadiness();
        }}
      />
      <MainView view={view} data={data} inspector={inspector} evals={evals} onOpenRun={openRun} />
    </div>
  );
}
