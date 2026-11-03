import { useCallback, useEffect, useRef, useState } from "react";
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
  const { selectRun: inspectRun, clear } = inspector;
  const { select: selectEval, setError: setEvalError } = evals;
  const [view, setView] = useState<View>("overview");
  const [openError, setOpenError] = useState<string | null>(null);
  const openGeneration = useRef(0);

  const selectRun = useCallback(
    (run: RunSummary) => {
      openGeneration.current++;
      setOpenError(null);
      const url = new URL(window.location.href);
      url.searchParams.set("run", run.runId);
      window.history.replaceState(null, "", url);
      setView("runs");
      selectEval(null);
      return inspectRun(run);
    },
    [inspectRun, selectEval],
  );

  // The run may be newer than the sidebar list, for example after a terminal plico eval.
  const openRun = useCallback(
    async (runId: string) => {
      const generation = ++openGeneration.current;
      try {
        const run = await fetchRun(runId);
        if (generation !== openGeneration.current) return;
        await selectRun(run);
        await loadRuns();
      } catch {
        if (generation !== openGeneration.current) return;
        setOpenError(`Failed to open run ${runId}`);
        setEvalError(`Failed to open run ${runId}`);
      }
    },
    [loadRuns, selectRun, setEvalError],
  );

  useEffect(() => {
    const runId = new URL(window.location.href).searchParams.get("run");
    if (runId) void openRun(runId);
    return () => {
      openGeneration.current++;
    };
  }, [openRun]);

  const showTopLevelView = (next: View) => {
    openGeneration.current++;
    setOpenError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
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
          openGeneration.current++;
          setView("evals");
          evals.select(null);
          evals.setError(null);
          void evals.refresh();
          void loadRuns();
        }}
        onShowReadiness={() => {
          openGeneration.current++;
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
