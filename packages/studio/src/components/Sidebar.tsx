import { toolbarButton } from "../styles";
import type { LoadedProject, RunSummary } from "../types";
import type { View } from "../view";

interface SidebarProps {
  project: LoadedProject | null;
  runs: RunSummary[];
  selectedRun: RunSummary | null;
  view: View;
  onSelectRun: (run: RunSummary) => void;
  onShowOverview: () => void;
  onShowInstructions: () => void;
  onShowRuns: () => void;
  onShowArtifacts: () => void;
  onShowEvals: () => void;
  onShowReadiness: () => void;
}

export function Sidebar({
  project,
  runs,
  selectedRun,
  view,
  onSelectRun,
  onShowOverview,
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
        <button type="button" onClick={onShowOverview} style={toolbarButton(view === "overview")}>
          Overview
        </button>
        <button type="button" onClick={onShowRuns} style={toolbarButton(view === "runs")}>
          Runs ({runs.length})
        </button>
        <button
          type="button"
          onClick={onShowInstructions}
          style={toolbarButton(view === "instructions")}
        >
          Instructions
        </button>
        <button
          type="button"
          onClick={onShowArtifacts}
          style={toolbarButton(view === "artifacts")}
          disabled={!selectedRun}
        >
          Artifacts
        </button>
        <button type="button" onClick={onShowEvals} style={toolbarButton(view === "evals")}>
          Evals
        </button>
        <button type="button" onClick={onShowReadiness} style={toolbarButton(view === "readiness")}>
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
