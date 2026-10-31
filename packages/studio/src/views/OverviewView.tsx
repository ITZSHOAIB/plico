import { emptyPanel, heading, meta, metaLoose, panel } from "../styles";
import type {
  ComposedInstructions,
  EvalReport,
  LoadedProject,
  ReadinessReport,
  RunSummary,
} from "../types";

interface OverviewViewProps {
  project: LoadedProject | null;
  runs: RunSummary[];
  instructions: ComposedInstructions | null;
  evalReport: EvalReport | null;
  readinessReport: ReadinessReport | null;
}

function latestRunLabel(runs: RunSummary[]): string {
  const [latest] = runs;
  if (!latest) return "0 run(s)";
  return `${runs.length} run(s), latest ${latest.status} at ${latest.endedAt}`;
}

export function OverviewView({
  project,
  runs,
  instructions,
  evalReport,
  readinessReport,
}: OverviewViewProps) {
  if (!project) {
    return <div style={emptyPanel}>Loading project…</div>;
  }

  return (
    <section aria-label="Project overview" style={panel}>
      <h3 style={heading}>{project.config.name}</h3>
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
          readinessReport
            ? `${readinessReport.summary.ok} ok, ${readinessReport.summary.warning} warning(s), ${readinessReport.summary.error} error(s)`
            : "Loading…"
        }
      />
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
