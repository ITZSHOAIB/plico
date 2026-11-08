import type { RunSummary } from "../types";

export const statusTones: Record<string, string> = {
  completed: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
  blocked: "bg-warning-soft text-warning",
  waiting: "bg-warning-soft text-warning",
  running: "bg-accent-soft text-accent",
};

export function StatusBadge({ status }: { status: RunSummary["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-semibold ${statusTones[status] ?? "bg-raised text-muted"}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full bg-current ${status === "running" ? "motion-safe:animate-pulse" : ""}`}
      />
      <span className="sr-only">{`Status: ${status}`}</span>
      <span aria-hidden="true">{status}</span>
    </span>
  );
}

const dotTones: Record<string, string> = {
  completed: "bg-success",
  failed: "bg-danger",
  blocked: "bg-warning",
  waiting: "bg-warning",
  running: "bg-accent motion-safe:animate-pulse",
};

export function StatusDot({ status }: { status: RunSummary["status"] }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${dotTones[status] ?? "bg-faint"}`}
    />
  );
}
