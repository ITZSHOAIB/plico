import type { ReactNode } from "react";
import { ReadinessDiagnostics } from "../components/ReadinessDiagnostics";
import { ReadinessError } from "../components/ReadinessError";
import { readinessSummaryText } from "../components/ReadinessSummary";
import type { ProjectData } from "../hooks/useProjectData";
import type { EvalReport, RunSummary } from "../types";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { EmptyState, Page, panelClass } from "../ui/Page";

interface OverviewViewProps {
  data: ProjectData;
  evalReport: EvalReport | null;
}

function latestRunLabel(runs: RunSummary[]): string {
  const [latest] = runs;
  if (!latest) return "No runs yet";
  const at = latest.endedAt ? shortDate(latest.endedAt) : "not ended";
  return `Latest ${latest.status} · ${at}`;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
          <div className="mt-1 font-mono text-small text-faint">{project.root}</div>
        </>
      }
    >
      <dl className="m-0 mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact icon="runs" label="Runs" value={String(runs.length)} detail={latestRunLabel(runs)} />
        <Fact
          icon="evals"
          label="Evals"
          value={evalReport ? `${evalReport.passed}/${evalReport.total} passed` : "—"}
          detail={
            evalReport
              ? evalReport.failed > 0
                ? `${evalReport.failed} failed`
                : "All passing"
              : "No eval results yet"
          }
          tone={evalReport && evalReport.failed > 0 ? "text-danger" : undefined}
        />
        <Fact
          icon="instructions"
          label="Instructions"
          value={
            instructions
              ? `${instructions.sources.length} source${instructions.sources.length === 1 ? "" : "s"}`
              : "…"
          }
          detail={instructions?.sources.join(", ") ?? "Loading…"}
        />
        <Fact
          icon="readiness"
          label="Readiness"
          value={
            readiness
              ? readiness.summary.error > 0
                ? "Needs attention"
                : readiness.summary.warning > 0
                  ? "Ready with warnings"
                  : "Ready"
              : data.readinessError
                ? "Unavailable"
                : "…"
          }
          detail={readiness ? readinessSummaryText(readiness.summary) : "Loading…"}
          tone={
            readiness
              ? readiness.summary.error > 0
                ? "text-danger"
                : readiness.summary.warning > 0
                  ? "text-warning"
                  : "text-success"
              : undefined
          }
        />
      </dl>
      {data.readinessError && (
        <ReadinessError error={data.readinessError} hasReport={!!readiness} />
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-title font-semibold tracking-tight">Readiness checks</h3>
          {readiness && (
            <p className="m-0 mt-0.5 text-small text-muted">
              Checked at {formatCheckedAt(readiness.timestamp)}
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => void data.loadReadiness()}>
          <Icon name="refresh" size="sm" />
          Refresh readiness
        </Button>
      </div>
      {readiness && <ReadinessDiagnostics diagnostics={readiness.diagnostics} />}
    </Page>
  );
}

function Fact({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: string | undefined;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 p-4 ${panelClass}`}>
      <dt className="flex items-center gap-2 text-small font-medium text-muted">
        <span className="grid size-6 place-items-center rounded-md bg-raised text-faint">
          <Icon name={icon} size="sm" />
        </span>
        {label}
      </dt>
      <dd className="m-0 min-w-0">
        <div className={`text-display font-semibold tracking-tight ${tone ?? "text-fg"}`}>
          {value}
        </div>
        <div className="mt-0.5 truncate text-small text-faint">{detail}</div>
      </dd>
    </div>
  );
}
