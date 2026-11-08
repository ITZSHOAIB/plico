import { formatRunId } from "../format-run-id";
import type { RunSummary } from "../types";
import { StatusDot } from "../ui/StatusBadge";

interface RunListProps {
  runs: RunSummary[];
  selectedRun: RunSummary | null;
  onSelectRun: (run: RunSummary) => void;
  /** Mobile shows the list as its own screen; desktop always shows it as a column. */
  visibleOnMobile: boolean;
}

function shortTime(iso: string | null): string {
  if (!iso) return "Not ended";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunList({ runs, selectedRun, onSelectRun, visibleOnMobile }: RunListProps) {
  return (
    <aside
      aria-label="Runs"
      className={`min-h-0 flex-col overflow-hidden border-line bg-surface lg:flex lg:w-72 lg:flex-none lg:border-r ${visibleOnMobile ? "flex flex-1" : "hidden"}`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="m-0 text-body font-semibold">Runs</h2>
        <span className="rounded-full bg-raised px-1.5 text-caption font-medium text-muted tabular-nums">
          {runs.length}
        </span>
      </div>
      {runs.length === 0 ? (
        <p className="m-0 px-4 py-6 text-small leading-relaxed text-faint">
          No runs yet. Send a message in Chat or run <code className="text-muted">plico run</code>{" "}
          to create one.
        </p>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
          {runs.map((run) => {
            const selected = selectedRun?.runId === run.runId;
            return (
              <li key={run.runId}>
                <button
                  type="button"
                  onClick={() => onSelectRun(run)}
                  aria-current={selected ? "true" : undefined}
                  title={run.runId}
                  className="grid w-full cursor-pointer grid-cols-[0.5rem_1fr] items-center gap-x-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-inherit transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=true]:bg-raised"
                >
                  <StatusDot status={run.status} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-small text-fg">
                      <span className="truncate">{formatRunId(run.runId)}</span>
                      {run.runId.startsWith("eval-") && (
                        <span className="shrink-0 rounded border border-line px-1 font-sans text-caption text-muted">
                          eval
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-caption text-faint">
                      <span className="capitalize">{run.status}</span> &middot;{" "}
                      {shortTime(run.endedAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
