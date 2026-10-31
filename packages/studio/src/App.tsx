import { useCallback, useEffect, useState } from "react";
import {
  fetchArtifactWorkspace,
  fetchEvents,
  fetchInstructions,
  fetchLatestEvalReport,
  fetchProject,
  fetchReadiness,
  fetchRuns,
  runEvals,
} from "./api";
import { Sidebar } from "./components/Sidebar";
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
} from "./types";
import type { View } from "./view";
import { MainView } from "./views/MainView";

export function App() {
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const [events, setEvents] = useState<PlicoEvent[]>([]);
  const [instructions, setInstructions] = useState<ComposedInstructions | null>(null);
  const [workspace, setWorkspace] = useState<ArtifactWorkspace | null>(null);
  const [previewFile, setPreviewFile] = useState<ArtifactFile | null>(null);
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null);
  const [selectedEvalResult, setSelectedEvalResult] = useState<EvalCaseResult | null>(null);
  const [runningEvals, setRunningEvals] = useState(false);
  const [readinessReport, setReadinessReport] = useState<ReadinessReport | null>(null);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    await fetchRuns()
      .then(setRuns)
      .catch(() => {});
  }, []);

  const loadReadiness = useCallback(async () => {
    await fetchReadiness()
      .then(setReadinessReport)
      .catch(() => setReadinessReport(null));
  }, []);

  const loadEvalReport = useCallback(async () => {
    await fetchLatestEvalReport()
      .then(setEvalReport)
      .catch(() => setEvalReport(null));
  }, []);

  useEffect(() => {
    fetchProject()
      .then(setProject)
      .catch(() => setError("Failed to load project"));
    fetchInstructions()
      .then(setInstructions)
      .catch(() => {});
    void loadRuns();
    void loadReadiness();
    void loadEvalReport();
  }, [loadRuns, loadReadiness, loadEvalReport]);

  const selectRun = useCallback(async (run: RunSummary) => {
    setSelectedRun(run);
    setView("runs");
    setPreviewFile(null);
    setSelectedEvalResult(null);
    try {
      setEvents(await fetchEvents(run.runId));
    } catch {
      setEvents([]);
    }
  }, []);

  const openRun = useCallback(
    (runId: string) => {
      const run = runs.find((candidate) => candidate.runId === runId);
      if (run) void selectRun(run);
    },
    [runs, selectRun],
  );

  const showArtifacts = useCallback(async () => {
    if (!selectedRun) return;
    setView("artifacts");
    setPreviewFile(null);
    try {
      setWorkspace(await fetchArtifactWorkspace(selectedRun.runId));
    } catch {
      setWorkspace(null);
    }
  }, [selectedRun]);

  const showEvals = useCallback(async () => {
    setView("evals");
    setSelectedEvalResult(null);
    await loadEvalReport();
  }, [loadEvalReport]);

  const startEvals = useCallback(async () => {
    setRunningEvals(true);
    setSelectedEvalResult(null);
    try {
      await runEvals();
      await Promise.all([loadEvalReport(), loadRuns(), loadReadiness()]);
    } catch {
      setEvalReport(null);
    } finally {
      setRunningEvals(false);
    }
  }, [loadEvalReport, loadRuns, loadReadiness]);

  const showReadiness = useCallback(async () => {
    setView("readiness");
    await loadReadiness();
  }, [loadReadiness]);

  const showTopLevelView = useCallback((next: View) => {
    setView(next);
    setSelectedRun(null);
    setPreviewFile(null);
  }, []);

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
        project={project}
        runs={runs}
        selectedRun={selectedRun}
        view={view}
        onSelectRun={selectRun}
        onShowOverview={() => showTopLevelView("overview")}
        onShowInstructions={() => showTopLevelView("instructions")}
        onShowRuns={() => showTopLevelView("runs")}
        onShowArtifacts={showArtifacts}
        onShowEvals={showEvals}
        onShowReadiness={showReadiness}
      />
      <MainView
        project={project}
        runs={runs}
        view={view}
        selectedRun={selectedRun}
        events={events}
        instructions={instructions}
        workspace={workspace}
        previewFile={previewFile}
        onPreviewFile={setPreviewFile}
        evalReport={evalReport}
        selectedEvalResult={selectedEvalResult}
        onSelectEvalResult={setSelectedEvalResult}
        onRunEvals={startEvals}
        onOpenRun={openRun}
        runningEvals={runningEvals}
        readinessReport={readinessReport}
        error={error}
      />
    </div>
  );
}
