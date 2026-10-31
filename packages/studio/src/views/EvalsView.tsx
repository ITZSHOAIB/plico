import type { EvalsState } from "../hooks/useEvals";
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
import type { EvalCaseResult } from "../types";

interface EvalsViewProps {
  evals: EvalsState;
  onOpenRun: (runId: string) => void;
}

const statusStyle = {
  pass: { label: "PASS", color: "#080", background: "#f0fff0" },
  fail: { label: "FAIL", color: "#c00", background: "#fff0f0" },
} satisfies Record<EvalCaseResult["status"], object>;

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ ...metaLoose, color: "#c00" }}>
      {message}
    </div>
  );
}

export function EvalsView({ evals, onOpenRun }: EvalsViewProps) {
  const { report, selected, running, error, run, select } = evals;

  if (selected) {
    return (
      <div style={panel}>
        <button type="button" onClick={() => select(null)} style={backButton}>
          ← Back to evals
        </button>
        <h3 style={headingTight}>{selected.name}</h3>
        <div style={meta}>
          {statusStyle[selected.status].label} &middot; Run: {selected.runId}
        </div>
        <ErrorNotice message={error} />
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
        <button type="button" onClick={run} disabled={running} style={toolbarButton(false)}>
          {running ? "Running…" : "Run evals"}
        </button>
      </div>
      <ErrorNotice message={error} />
      {report ? (
        <>
          <div style={metaLoose}>
            {report.passed}/{report.total} passed, {report.failed} failed &middot;{" "}
            {report.evaluatedAt}
          </div>
          {report.results.map((result) => {
            const { label, color, background } = statusStyle[result.status];
            return (
              <button
                key={result.runId}
                type="button"
                onClick={() => select(result)}
                style={{ ...listItemButton, background, border: "1px solid #ddd" }}
              >
                <span style={{ fontWeight: 500 }}>{result.name}</span>
                <span style={{ marginLeft: "8px", color }}>{label}</span>
                <span style={{ marginLeft: "8px", color: "#999" }}>{result.runId}</span>
              </button>
            );
          })}
        </>
      ) : (
        <div style={metaLoose}>No eval results yet. Run evals to see them here.</div>
      )}
    </div>
  );
}
