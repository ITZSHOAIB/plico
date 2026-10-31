import {
  backButton,
  codeBlock,
  headingTight,
  listItemButton,
  meta,
  metaLoose,
  panel,
  toolbarButton,
} from "../styles";
import type { EvalCaseResult, EvalReport } from "../types";

interface EvalsViewProps {
  report: EvalReport | null;
  selected: EvalCaseResult | null;
  running: boolean;
  onSelect: (result: EvalCaseResult | null) => void;
  onRun: () => void;
  onOpenRun: (runId: string) => void;
}

export function EvalsView({
  report,
  selected,
  running,
  onSelect,
  onRun,
  onOpenRun,
}: EvalsViewProps) {
  if (selected) {
    return (
      <div style={panel}>
        <button type="button" onClick={() => onSelect(null)} style={backButton}>
          ← Back to evals
        </button>
        <h3 style={headingTight}>{selected.name}</h3>
        <div style={meta}>
          {selected.status === "pass" ? "PASS" : "FAIL"} &middot; Run: {selected.runId}
        </div>
        <button
          type="button"
          onClick={() => onOpenRun(selected.runId)}
          style={{ ...toolbarButton(false), marginBottom: "8px" }}
        >
          View run
        </button>
        {selected.output && (
          <div style={{ marginBottom: "8px" }}>
            <strong style={{ fontSize: "12px" }}>Output:</strong>
            <pre style={codeBlock}>{selected.output}</pre>
          </div>
        )}
        {selected.diagnostics?.length ? (
          <div>
            <strong style={{ fontSize: "12px" }}>Diagnostics:</strong>
            {selected.diagnostics.map((d) => (
              <div key={`diag-${d}`} style={{ fontSize: "12px", color: "#c00", marginTop: "4px" }}>
                {d}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={panel}>
      <h3 style={headingTight}>Eval Results</h3>
      <div style={{ marginBottom: "8px" }}>
        <button type="button" onClick={onRun} disabled={running} style={toolbarButton(false)}>
          {running ? "Running…" : "Run evals"}
        </button>
      </div>
      {report ? (
        <>
          <div style={metaLoose}>
            {report.passed}/{report.total} passed, {report.failed} failed &middot;{" "}
            {report.evaluatedAt}
          </div>
          {report.results.map((result) => (
            <button
              key={result.runId}
              type="button"
              onClick={() => onSelect(result)}
              style={{
                ...listItemButton,
                background: result.status === "pass" ? "#f0fff0" : "#fff0f0",
                border: "1px solid #ddd",
              }}
            >
              <span style={{ fontWeight: 500 }}>{result.name}</span>
              <span
                style={{ marginLeft: "8px", color: result.status === "pass" ? "#080" : "#c00" }}
              >
                {result.status === "pass" ? "PASS" : "FAIL"}
              </span>
              <span style={{ marginLeft: "8px", color: "#999" }}>{result.runId}</span>
            </button>
          ))}
        </>
      ) : (
        <div style={metaLoose}>No eval results yet. Run evals to see them here.</div>
      )}
    </div>
  );
}
