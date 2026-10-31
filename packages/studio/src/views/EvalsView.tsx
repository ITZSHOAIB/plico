import {
  backButton,
  codeBlock,
  emptyPanel,
  heading,
  headingTight,
  listItemButton,
  meta,
  metaLoose,
  panel,
} from "../styles";
import type { EvalCaseResult, EvalSummary } from "../types";

interface EvalsViewProps {
  summary: EvalSummary | null;
  selected: EvalCaseResult | null;
  onSelect: (result: EvalCaseResult) => void;
}

export function EvalsView({ summary, selected, onSelect }: EvalsViewProps) {
  if (selected) {
    return (
      <div style={panel}>
        <button type="button" onClick={() => onSelect(selected)} style={backButton}>
          ← Back to evals
        </button>
        <h3 style={headingTight}>{selected.name}</h3>
        <div style={meta}>
          {selected.status === "pass" ? "PASS" : "FAIL"} &middot; Run: {selected.runId}
        </div>
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

  if (!summary) {
    return <div style={emptyPanel}>No eval data available.</div>;
  }

  return (
    <div style={panel}>
      <h3 style={heading}>Eval Results</h3>
      <div style={metaLoose}>
        {summary.passed}/{summary.total} passed, {summary.failed} failed
      </div>
      {summary.results.map((result) => (
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
          <span style={{ marginLeft: "8px", color: result.status === "pass" ? "#080" : "#c00" }}>
            {result.status === "pass" ? "PASS" : "FAIL"}
          </span>
          <span style={{ marginLeft: "8px", color: "#999" }}>{result.runId}</span>
        </button>
      ))}
    </div>
  );
}
