import type { EvalsState } from "../hooks/useEvals";
import type { EvalCaseResult } from "../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CodeBlock, listRowClass, Notice, Page, sectionHeadingClass } from "../ui/Page";

interface EvalsViewProps {
  evals: EvalsState;
  onOpenRun: (runId: string) => void;
}

const statusStyle = {
  pass: { label: "PASS", tone: "text-success", icon: "ok" },
  fail: { label: "FAIL", tone: "text-danger", icon: "error" },
} as const satisfies Record<EvalCaseResult["status"], object>;

export function EvalsView({ evals, onOpenRun }: EvalsViewProps) {
  const { report, selected, running, error, run, select } = evals;

  if (selected) {
    return (
      <Page
        title={selected.name}
        subtitle={
          <>
            {statusStyle[selected.status].label} &middot; Run: {selected.runId}
          </>
        }
        onBack={() => select(null)}
        backLabel="Back to evals"
        actions={<Button onClick={() => onOpenRun(selected.runId)}>View run</Button>}
      >
        {error && <Notice>{error}</Notice>}
        {selected.output && (
          <div className="mb-4">
            <h3 className={sectionHeadingClass}>Output:</h3>
            <CodeBlock className="text-fg">{selected.output}</CodeBlock>
          </div>
        )}
        {selected.diagnostics?.length ? (
          <div>
            <h3 className={sectionHeadingClass}>Diagnostics:</h3>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {selected.diagnostics.map((d) => (
                <li
                  key={`diag-${d}`}
                  className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-small text-danger"
                >
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Page>
    );
  }

  return (
    <Page
      title="Eval Results"
      subtitle={
        report ? (
          <>
            {report.passed}/{report.total} passed, {report.failed} failed &middot;{" "}
            {report.evaluatedAt}
          </>
        ) : undefined
      }
      actions={
        <Button variant="primary" onClick={run} disabled={running}>
          {running ? "Running…" : "Run evals"}
        </Button>
      }
    >
      {error && <Notice>{error}</Notice>}
      {report ? (
        <ul className="m-0 list-none overflow-hidden rounded-panel border border-line bg-surface p-0">
          {report.results.map((result) => {
            const { label, tone, icon } = statusStyle[result.status];
            return (
              <li key={result.runId}>
                <button type="button" onClick={() => select(result)} className={listRowClass}>
                  <span className={tone}>
                    <Icon name={icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{result.name}</span>
                    <span className={`ml-2 text-caption font-semibold ${tone}`}>{label}</span>
                    <span className="block truncate font-mono text-caption text-faint">
                      {result.runId}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : !error ? (
        <div className="text-muted">No eval results yet. Run evals to see them here.</div>
      ) : null}
    </Page>
  );
}
