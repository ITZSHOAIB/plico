import { useCallback, useEffect, useState } from "react";
import {
  fetchArtifactWorkspace,
  fetchEvalResults,
  fetchEvents,
  fetchInstructions,
  fetchProject,
  fetchReadiness,
  fetchRuns,
} from "./api";
import { Sidebar } from "./components/Sidebar";
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
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [selectedEvalResult, setSelectedEvalResult] = useState<EvalCaseResult | null>(null);
  const [readinessReport, setReadinessReport] = useState<ReadinessReport | null>(null);
  const [view, setView] = useState<View>("runs");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProject()
      .then(setProject)
      .catch(() => setError("Failed to load project"));
    fetchRuns()
      .then(setRuns)
      .catch(() => {});
    fetchInstructions()
      .then(setInstructions)
      .catch(() => {});
  }, []);

  const selectRun = useCallback(async (run: RunSummary) => {
    setSelectedRun(run);
    setView("runs");
    setPreviewFile(null);
    try {
      const evts = await fetchEvents(run.runId);
      setEvents(evts);
    } catch {
      setEvents([]);
    }
  }, []);

  const showArtifacts = useCallback(async () => {
    if (!selectedRun) return;
    setView("artifacts");
    setPreviewFile(null);
    try {
      const ws = await fetchArtifactWorkspace(selectedRun.runId);
      setWorkspace(ws);
    } catch {
      setWorkspace(null);
    }
  }, [selectedRun]);

  const showEvals = useCallback(async () => {
    setView("evals");
    setSelectedEvalResult(null);
    try {
      const summary = await fetchEvalResults();
      setEvalSummary(summary);
    } catch {
      setEvalSummary(null);
    }
  }, []);

  const selectEvalRun = useCallback(async (result: EvalCaseResult) => {
    setSelectedEvalResult(result);
    setView("evals");
  }, []);

  const showReadiness = useCallback(async () => {
    setView("readiness");
    try {
      const report = await fetchReadiness();
      setReadinessReport(report);
    } catch {
      setReadinessReport(null);
    }
  }, []);

  const showRunsOverview = useCallback(() => {
    setView("runs");
    setSelectedRun(null);
    setPreviewFile(null);
  }, []);

  const showInstructions = useCallback(() => {
    setView("instructions");
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
        onShowInstructions={showInstructions}
        onShowRuns={showRunsOverview}
        onShowArtifacts={showArtifacts}
        onShowEvals={showEvals}
        onShowReadiness={showReadiness}
      />
      <MainView
        project={project}
        view={view}
        selectedRun={selectedRun}
        events={events}
        instructions={instructions}
        workspace={workspace}
        previewFile={previewFile}
        onPreviewFile={setPreviewFile}
        evalSummary={evalSummary}
        selectedEvalResult={selectedEvalResult}
        onSelectEvalRun={selectEvalRun}
        readinessReport={readinessReport}
        error={error}
      />
    </div>
  );
}
