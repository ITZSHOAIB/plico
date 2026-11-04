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
      <div className="flex items-center justify-between border-b border-line px-4 py-3 font-semibold">
        Runs
        <span className="font-normal text-muted">{runs.length}</span>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {runs.map((run) => {
          const selected = selectedRun?.runId === run.runId;
          return (
            <li key={run.runId}>
              <button
                type="button"
                onClick={() => onSelectRun(run)}
                aria-current={selected ? "true" : undefined}
                className="grid w-full cursor-pointer grid-cols-[0.5rem_1fr] items-center gap-x-3 border-0 border-b border-line-subtle bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent aria-[current=true]:bg-raised aria-[current=true]:shadow-[inset_2px_0_var(--accent)]"
              >
                <StatusDot status={run.status} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-mono text-small">
                    <span className="truncate">{run.runId.substring(0, 12)}…</span>
                    {run.runId.startsWith("eval-") && (
                      <span className="rounded border border-line px-1 text-caption text-muted">
                        eval
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-caption text-faint">
                    {run.status} &middot; {shortTime(run.endedAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
