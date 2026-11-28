import { formatRunId } from "../format-run-id";
import type { PlicoEvent, RunSummary } from "../types";
import { StatusDot } from "../ui/StatusBadge";
import { formatUsage } from "../usage";

interface ChildRun {
  runId: string;
  agentId: string;
  task: string;
  status: "running" | "completed" | "failed" | "cancelled";
  usage: string | null;
}

/** Delegations and workflow agent calls, in the order the run made them. */
export function childRuns(events: readonly PlicoEvent[]): ChildRun[] {
  const children = new Map<string, ChildRun>();
  for (const event of events) {
    if (event.type === "agent.called")
      children.set(event.payload.runId, {
        runId: event.payload.runId,
        agentId: event.payload.agentId,
        task: event.payload.task,
        status: "running",
        usage: null,
      });
    if (event.type === "agent.returned") {
      const child = children.get(event.payload.runId);
      if (child) {
        child.status = event.payload.status;
        child.usage = formatUsage(event.payload.usage);
      }
    }
  }
  return [...children.values()];
}

/** Which agent or workflow a run executed, where it sits in its tree, and the child runs it made. */
export function RunAgents({
  run,
  events,
  onOpenRun,
}: {
  run: RunSummary;
  events: readonly PlicoEvent[];
  onOpenRun?: ((runId: string) => void) | undefined;
}) {
  const children = childRuns(events);
  const target = run.workflowId
    ? `Workflow ${run.workflowId}`
    : run.agentId && run.agentId !== "main"
      ? `Agent ${run.agentId}`
      : null;
  if (!target && !run.parentRunId && children.length === 0) return null;
  const parentRunId = run.parentRunId;
  return (
    <section aria-label="Agents" className="border-b border-line px-4 py-2.5 text-small">
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {target && <span className="font-medium text-fg">{target}</span>}
        {parentRunId && (
          <span>
            Child of <RunLink runId={parentRunId} onOpenRun={onOpenRun} />
          </span>
        )}
      </p>
      {children.length > 0 && (
        <ul aria-label="Child runs" className="m-0 mt-2 grid list-none gap-1 p-0">
          {children.map((child) => (
            <li
              key={child.runId}
              className="grid grid-cols-[0.5rem_auto_1fr_auto] items-center gap-x-2"
            >
              <StatusDot status={child.status} />
              <span className="font-medium text-fg">{child.agentId}</span>
              <span className="min-w-0 truncate text-faint" title={child.task}>
                <RunLink runId={child.runId} onOpenRun={onOpenRun} /> &middot; {child.task}
              </span>
              <span className="text-caption text-faint tabular-nums">{child.usage}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RunLink({
  runId,
  onOpenRun,
}: {
  runId: string;
  onOpenRun?: ((runId: string) => void) | undefined;
}) {
  // A child run's ID is its root's plus a segment, so the segment is what tells siblings apart.
  const label = runId.includes(".") ? runId.slice(runId.lastIndexOf(".") + 1) : formatRunId(runId);
  if (!onOpenRun) return <span className="font-mono">{label}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpenRun(runId)}
      title={runId}
      className="cursor-pointer border-0 bg-transparent p-0 font-mono text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {label}
    </button>
  );
}
