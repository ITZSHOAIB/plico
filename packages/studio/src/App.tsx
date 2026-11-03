import { useCallback, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { useEvals } from "./hooks/useEvals";
import { useProjectData } from "./hooks/useProjectData";
import { useRunInspector } from "./hooks/useRunInspector";
import { useRunUrl } from "./hooks/useRunUrl";
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
  const { selectRun: inspectRun, clear } = inspector;
  const { select: selectEval, setError: setEvalError } = evals;
  const [view, setView] = useState<View>("overview");
  const onSelect = useCallback(() => {
    setView("runs");
    selectEval(null);
  }, [selectEval]);
  const { selectRun, openRun, openError, clearRunUrl } = useRunUrl(
    inspectRun,
    onSelect,
    loadRuns,
    setEvalError,
  );

  const showTopLevelView = (next: View) => {
    clearRunUrl();
    setView(next);
    clear();
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
          clearRunUrl();
          setView("evals");
          evals.select(null);
          evals.setError(null);
          void evals.refresh();
          void loadRuns();
        }}
        onShowReadiness={() => {
          clearRunUrl();
          setView("readiness");
          void loadReadiness();
        }}
      />
      {data.runsError && <div role="alert">{data.runsError}</div>}
      {openError && view !== "evals" ? <div role="alert">{openError}</div> : null}
      <MainView view={view} data={data} inspector={inspector} evals={evals} onOpenRun={openRun} />
    </div>
  );
}
