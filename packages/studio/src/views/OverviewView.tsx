import { ReadinessDiagnostics } from "../components/ReadinessDiagnostics";
import type { ProjectData } from "../hooks/useProjectData";
import { emptyPanel, heading, meta, metaLoose, panel, toolbarButton } from "../styles";
import type { EvalReport, RunSummary } from "../types";

interface OverviewViewProps {
  data: ProjectData;
  evalReport: EvalReport | null;
}

function latestRunLabel(runs: RunSummary[]): string {
  const [latest] = runs;
  if (!latest) return "0 run(s)";
  return `${runs.length} run(s), latest ${latest.status}${latest.endedAt ? ` at ${latest.endedAt}` : " (not ended)"}`;
}

export function OverviewView({ data, evalReport }: OverviewViewProps) {
  const { project, runs, instructions, readiness } = data;
  if (!project) {
    return <div style={emptyPanel}>Loading project…</div>;
  }

  return (
    <section aria-label="Project overview" style={panel}>
      <h3 style={heading}>{project.config.name}</h3>
      <div style={meta}>Current project and readiness</div>
      <div style={metaLoose}>{project.root}</div>
      <Fact label="Runs" value={latestRunLabel(runs)} />
      <Fact
        label="Evals"
        value={
          evalReport
            ? `${evalReport.passed}/${evalReport.total} passed, ${evalReport.failed} failed`
            : "No eval results yet"
        }
      />
      <Fact
        label="Readiness"
        value={
          readiness
            ? `${readiness.summary.ok} ok, ${readiness.summary.warning} warning(s), ${readiness.summary.error} error(s)`
            : data.readinessError
              ? "Unavailable"
              : "Loading…"
        }
      />
      {data.readinessError && (
        <div role="alert">
          {data.readinessError}
          {readiness && ". Showing the last successful report."}
        </div>
      )}
      {readiness && <div style={meta}>Checked at {readiness.timestamp}</div>}
      <button type="button" style={toolbarButton(false)} onClick={() => void data.loadReadiness()}>
        Refresh readiness
      </button>
      {readiness && <ReadinessDiagnostics diagnostics={readiness.diagnostics} />}
      <Fact label="Instructions" value={instructions?.sources.join(", ") ?? "Loading…"} />
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={meta}>{label}</div>
      <div style={{ fontSize: "13px" }}>{value}</div>
    </div>
  );
}
