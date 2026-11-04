import type { ReactNode } from "react";
import { ReadinessDiagnostics } from "../components/ReadinessDiagnostics";
import { ReadinessError } from "../components/ReadinessError";
import type { ProjectData } from "../hooks/useProjectData";
import type { EvalReport, RunSummary } from "../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { EmptyState, Page } from "../ui/Page";

interface OverviewViewProps {
  data: ProjectData;
  evalReport: EvalReport | null;
}

function latestRunLabel(runs: RunSummary[]): string {
  const [latest] = runs;
  if (!latest) return "0 run(s)";
  return `${runs.length} run(s), latest ${latest.status}${latest.endedAt ? ` at ${latest.endedAt}` : " (not ended)"}`;
}

function formatCheckedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

export function OverviewView({ data, evalReport }: OverviewViewProps) {
  const { project, runs, instructions, readiness } = data;
  if (!project) {
    return <EmptyState>Loading project…</EmptyState>;
  }

  return (
    <Page
      label="Project overview"
      title={project.config.name}
      subtitle={
        <>
          <div>Current project and readiness</div>
          <div className="text-faint">{project.root}</div>
        </>
      }
    >
      <dl className="m-0 mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Runs" value={latestRunLabel(runs)} />
        <Fact
          label="Evals"
          value={
            evalReport
              ? `${evalReport.passed}/${evalReport.total} passed, ${evalReport.failed} failed`
              : "No eval results yet"
          }
        />
        <Fact label="Instructions" value={instructions?.sources.join(", ") ?? "Loading…"} />
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
      </dl>
      {data.readinessError && (
        <ReadinessError error={data.readinessError} hasReport={!!readiness} />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void data.loadReadiness()}>
          <Icon name="refresh" size="sm" />
          Refresh readiness
        </Button>
        {readiness && (
          <span className="text-small text-muted">
            Checked at {formatCheckedAt(readiness.timestamp)}
          </span>
        )}
      </div>
      {readiness && <ReadinessDiagnostics diagnostics={readiness.diagnostics} />}
    </Page>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-panel border border-line bg-surface p-3">
      <dt className="mb-1 text-caption tracking-wider text-muted uppercase">{label}</dt>
      <dd className="m-0 break-words">{value}</dd>
    </div>
  );
}
