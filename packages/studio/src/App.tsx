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

type View = "runs" | "instructions" | "artifacts" | "evals" | "readiness";

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
        onShowInstructions={() => {
          setView("instructions");
          setSelectedRun(null);
          setPreviewFile(null);
        }}
        onShowRuns={() => {
          setView("runs");
          setSelectedRun(null);
          setPreviewFile(null);
        }}
        onShowArtifacts={showArtifacts}
        onShowEvals={showEvals}
        onShowReadiness={showReadiness}
      />
      <Main
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

interface SidebarProps {
  project: LoadedProject | null;
  runs: RunSummary[];
  selectedRun: RunSummary | null;
  view: View;
  onSelectRun: (run: RunSummary) => void;
  onShowInstructions: () => void;
  onShowRuns: () => void;
  onShowArtifacts: () => void;
  onShowEvals: () => void;
  onShowReadiness: () => void;
}

function Sidebar({
  project,
  runs,
  selectedRun,
  view,
  onSelectRun,
  onShowInstructions,
  onShowRuns,
  onShowArtifacts,
  onShowEvals,
  onShowReadiness,
}: SidebarProps) {
  return (
    <div
      style={{
        width: 260,
        borderRight: "1px solid #ccc",
        padding: "8px",
        overflowY: "auto",
        background: "#f5f5f5",
      }}
    >
      <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Plico Studio</h2>
      {project && (
        <div
          style={{
            marginBottom: "12px",
            padding: "6px",
            background: "#fff",
            borderRadius: "4px",
            border: "1px solid #ddd",
          }}
        >
          <div>
            <strong>{project.config.name}</strong>
          </div>
          <div style={{ color: "#666", fontSize: "12px" }}>{project.root}</div>
        </div>
      )}
      <div style={{ marginBottom: "8px" }}>
        <button type="button" onClick={onShowRuns} style={buttonStyle(view === "runs")}>
          Runs ({runs.length})
        </button>
        <button
          type="button"
          onClick={onShowInstructions}
          style={buttonStyle(view === "instructions")}
        >
          Instructions
        </button>
        <button
          type="button"
          onClick={onShowArtifacts}
          style={buttonStyle(view === "artifacts")}
          disabled={!selectedRun}
        >
          Artifacts
        </button>
        <button type="button" onClick={onShowEvals} style={buttonStyle(view === "evals")}>
          Evals
        </button>
        <button type="button" onClick={onShowReadiness} style={buttonStyle(view === "readiness")}>
          Readiness
        </button>
      </div>
      <div>
        {runs.map((run) => (
          <button
            key={run.runId}
            type="button"
            onClick={() => onSelectRun(run)}
            style={{
              display: "block",
              width: "100%",
              padding: "4px 6px",
              cursor: "pointer",
              borderRadius: "3px",
              background: selectedRun?.runId === run.runId ? "#d0e4f5" : "transparent",
              marginBottom: "2px",
              fontSize: "12px",
              border: "none",
              textAlign: "left",
              fontFamily: "inherit",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 500 }}>{run.runId.substring(0, 12)}…</div>
            <div style={{ color: "#666" }}>
              {run.status} &middot; {run.endedAt}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    marginRight: "4px",
    padding: "4px 10px",
    border: "1px solid #aaa",
    borderRadius: "3px",
    background: active ? "#d0e4f5" : "#fff",
    cursor: "pointer",
    fontSize: "12px",
  };
}

interface MainProps {
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

function Main({
  project,
  view,
  selectedRun,
  events,
  instructions,
  workspace,
  previewFile,
  onPreviewFile,
  evalSummary,
  selectedEvalResult,
  onSelectEvalRun,
  readinessReport,
  error,
}: MainProps) {
  if (error) {
    return <div style={{ padding: "16px", color: "#c00" }}>{error}</div>;
  }

  if (view === "instructions" && instructions) {
    return (
      <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Composed Instructions</h3>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
          Sources: {instructions.sources.join(", ")}
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "12px",
            background: "#f9f9f9",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          {instructions.content}
        </pre>
      </div>
    );
  }

  if (view === "evals") {
    if (selectedEvalResult) {
      return (
        <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
          <button
            type="button"
            onClick={() => onSelectEvalRun(selectedEvalResult)}
            style={{ marginBottom: "8px", fontSize: "12px", cursor: "pointer" }}
          >
            ← Back to evals
          </button>
          <h3 style={{ fontSize: "14px", margin: "0 0 4px" }}>{selectedEvalResult.name}</h3>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            {selectedEvalResult.status === "pass" ? "PASS" : "FAIL"} &middot; Run:{" "}
            {selectedEvalResult.runId}
          </div>
          {selectedEvalResult.output && (
            <div style={{ marginBottom: "8px" }}>
              <strong style={{ fontSize: "12px" }}>Output:</strong>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "12px",
                  background: "#f9f9f9",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              >
                {selectedEvalResult.output}
              </pre>
            </div>
          )}
          {selectedEvalResult.diagnostics?.length ? (
            <div>
              <strong style={{ fontSize: "12px" }}>Diagnostics:</strong>
              {selectedEvalResult.diagnostics.map((d, _i) => (
                <div
                  key={`diag-${d}`}
                  style={{ fontSize: "12px", color: "#c00", marginTop: "4px" }}
                >
                  {d}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (!evalSummary) {
      return <div style={{ flex: 1, padding: "16px", color: "#666" }}>No eval data available.</div>;
    }

    return (
      <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Eval Results</h3>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
          {evalSummary.passed}/{evalSummary.total} passed, {evalSummary.failed} failed
        </div>
        {evalSummary.results.map((result) => (
          <button
            key={result.runId}
            type="button"
            onClick={() => onSelectEvalRun(result)}
            style={{
              display: "block",
              width: "100%",
              padding: "6px 8px",
              cursor: "pointer",
              borderRadius: "3px",
              background: result.status === "pass" ? "#f0fff0" : "#fff0f0",
              marginBottom: "2px",
              fontSize: "12px",
              border: "1px solid #ddd",
              textAlign: "left",
              fontFamily: "inherit",
              color: "inherit",
            }}
          >
            <span style={{ fontWeight: 500 }}>{result.name}</span>
            <span style={{ marginLeft: "8px", color: result.status === "pass" ? "#080" : "#c00" }}>
              {result.status === "pass" ? "PASS" : "FAIL"}
            </span>
            <span style={{ marginLeft: "8px", color: "#999" }}>{result.runId}</span>
          </button>
        ))}
      </div>
    );
  }

  if (view === "readiness") {
    if (!readinessReport) {
      return (
        <div style={{ flex: 1, padding: "16px", color: "#666" }}>Loading readiness report…</div>
      );
    }

    const severityColor = (s: string) => {
      if (s === "error") return "#c00";
      if (s === "warning") return "#b60";
      return "#080";
    };

    return (
      <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Local Readiness Report</h3>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
          {readinessReport.summary.ok} ok, {readinessReport.summary.warning} warning(s),{" "}
          {readinessReport.summary.error} error(s)
        </div>
        {readinessReport.diagnostics.map((d) => (
          <div
            key={`rd-${d.subsystem}-${d.message}`}
            style={{
              padding: "6px 8px",
              marginBottom: "4px",
              borderRadius: "3px",
              border: `1px solid ${severityColor(d.severity)}`,
              background:
                d.severity === "error"
                  ? "#fff0f0"
                  : d.severity === "warning"
                    ? "#fff8f0"
                    : "#f0fff0",
              fontSize: "12px",
            }}
          >
            <div style={{ fontWeight: 500 }}>
              <span style={{ color: severityColor(d.severity) }}>
                {d.severity === "error" ? "ERROR" : d.severity === "warning" ? "WARN" : "OK"}
              </span>{" "}
              {d.subsystem}
              {d.path ? ` [${d.path}]` : ""}
            </div>
            <div style={{ marginTop: "2px", color: "#333" }}>{d.message}</div>
          </div>
        ))}
      </div>
    );
  }

  if (view === "artifacts") {
    if (!selectedRun) {
      return (
        <div style={{ flex: 1, padding: "16px", color: "#666" }}>
          Select a run to view artifacts.
        </div>
      );
    }

    if (!workspace) {
      return (
        <div style={{ flex: 1, padding: "16px", color: "#666" }}>
          No artifact workspace for this run.
        </div>
      );
    }

    if (previewFile) {
      return (
        <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
          <button
            type="button"
            onClick={() => onPreviewFile(null)}
            style={{ marginBottom: "8px", fontSize: "12px", cursor: "pointer" }}
          >
            ← Back to files
          </button>
          <h3 style={{ fontSize: "14px", margin: "0 0 4px" }}>{previewFile.path}</h3>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            {previewFile.mimeType}
          </div>
          <FilePreview file={previewFile} />
        </div>
      );
    }

    return (
      <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 4px" }}>
          Artifact Workspace: {workspace.workspaceId}
        </h3>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
          {workspace.files.length} file(s) &middot; {workspace.snapshots.length} snapshot(s)
        </div>
        {workspace.files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => onPreviewFile(file)}
            style={{
              display: "block",
              width: "100%",
              padding: "6px 8px",
              cursor: "pointer",
              borderRadius: "3px",
              background: "#fafafa",
              marginBottom: "2px",
              fontSize: "12px",
              border: "1px solid #eee",
              textAlign: "left",
              fontFamily: "inherit",
              color: "inherit",
            }}
          >
            {file.path}
            <span style={{ color: "#999", marginLeft: "8px" }}>{file.mimeType}</span>
          </button>
        ))}
      </div>
    );
  }

  if (!selectedRun) {
    return (
      <div style={{ flex: 1, padding: "16px", color: "#666" }}>
        {project ? `Project: ${project.config.name}. Select a run to inspect.` : "Loading project…"}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
      <h3 style={{ fontSize: "14px", margin: "0 0 4px" }}>{selectedRun.runId}</h3>
      <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
        Status: {selectedRun.status} | Started: {selectedRun.startedAt} | Ended:{" "}
        {selectedRun.endedAt}
      </div>
      <EventList events={events} />
    </div>
  );
}

interface EventListProps {
  events: PlicoEvent[];
}

function EventList({ events }: EventListProps) {
  return (
    <div>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}

interface EventRowProps {
  event: PlicoEvent;
}

function EventRow({ event }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: "4px", border: "1px solid #eee", borderRadius: "3px" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          gap: "8px",
          width: "100%",
          padding: "4px 8px",
          cursor: "pointer",
          background: "#fafafa",
          fontSize: "12px",
          border: "none",
          textAlign: "left",
          fontFamily: "inherit",
          color: "inherit",
        }}
      >
        <span style={{ color: "#999", minWidth: "24px" }}>{event.sequence}</span>
        <span style={{ fontWeight: 500, minWidth: "140px" }}>{event.type}</span>
        <span style={{ color: "#999", fontSize: "11px" }}>{event.timestamp}</span>
      </button>
      {expanded && (
        <div style={{ padding: "4px 8px 8px", fontSize: "12px" }}>
          <ToolEventDetail event={event} />
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f9f9f9",
              padding: "4px",
              borderRadius: "2px",
              margin: "4px 0 0",
              fontSize: "11px",
            }}
          >
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ToolEventDetailProps {
  event: PlicoEvent;
}

function ToolEventDetail({ event }: ToolEventDetailProps) {
  if (
    event.type === "tool.call" ||
    event.type === "tool.result" ||
    event.type === "approval.required" ||
    event.type === "policy.decision"
  ) {
    const toolName = String(event.payload.toolName ?? "");
    const details: string[] = [];
    if (toolName) details.push(`tool: ${toolName}`);
    if (event.type === "approval.required") {
      details.push("requires approval");
    }
    if (event.type === "policy.decision") {
      const decision = String(event.payload.decision ?? "");
      const reason = String(event.payload.reason ?? "");
      if (decision) details.push(`decision: ${decision}`);
      if (reason) details.push(reason);
    }
    if (details.length > 0) {
      return <div style={{ marginBottom: "4px" }}>{details.join(" | ")}</div>;
    }
  }
  return null;
}

interface FilePreviewProps {
  file: ArtifactFile;
}

function FilePreview({ file }: FilePreviewProps) {
  if (file.mimeType === "application/json") {
    try {
      const parsed = JSON.parse(file.content);
      return (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "12px",
            background: "#f9f9f9",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>{file.content}</pre>;
    }
  }

  if (file.mimeType === "text/markdown" || file.path.endsWith(".md")) {
    return (
      <div
        style={{
          fontSize: "13px",
          lineHeight: "1.6",
          background: "#f9f9f9",
          padding: "8px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        {file.content.split("\n").map((line, i) => {
          const k = `l-${i}`;
          if (line.startsWith("# "))
            return (
              <h1 key={k} style={{ fontSize: "18px", margin: "8px 0 4px" }}>
                {line.slice(2)}
              </h1>
            );
          if (line.startsWith("## "))
            return (
              <h2 key={k} style={{ fontSize: "15px", margin: "6px 0 3px" }}>
                {line.slice(3)}
              </h2>
            );
          if (line.startsWith("### "))
            return (
              <h3 key={k} style={{ fontSize: "14px", margin: "4px 0 2px" }}>
                {line.slice(4)}
              </h3>
            );
          if (line.trim() === "") return <br key={k} />;
          return (
            <p key={k} style={{ margin: "2px 0" }}>
              {line}
            </p>
          );
        })}
      </div>
    );
  }

  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        fontSize: "12px",
        background: "#f9f9f9",
        padding: "8px",
        border: "1px solid #ddd",
        borderRadius: "4px",
        maxHeight: "70vh",
        overflowY: "auto",
      }}
    >
      {file.content}
    </pre>
  );
}
