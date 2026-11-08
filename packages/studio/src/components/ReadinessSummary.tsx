import type { ReadinessReport } from "../types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "12 checks passed" or "1 error · 2 warnings", for headings and stat cards. */
export function readinessSummaryText(summary: ReadinessReport["summary"]): string {
  if (summary.error === 0 && summary.warning === 0) return `${plural(summary.ok, "check")} passed`;
  const parts = [];
  if (summary.error > 0) parts.push(plural(summary.error, "error"));
  if (summary.warning > 0) parts.push(plural(summary.warning, "warning"));
  parts.push(`${summary.ok} ok`);
  return parts.join(" · ");
}

export function ReadinessSummary({ summary }: { summary: ReadinessReport["summary"] }) {
  const items = [
    { label: "OK", count: summary.ok, tone: "bg-success-soft text-success" },
    { label: "Warnings", count: summary.warning, tone: "bg-warning-soft text-warning" },
    { label: "Errors", count: summary.error, tone: "bg-danger-soft text-danger" },
  ];
  return (
    <ul aria-label="Readiness summary" className="m-0 mb-4 flex list-none flex-wrap gap-2 p-0">
      {items.map((item) => (
        <li
          key={item.label}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-medium ${item.count > 0 || item.label === "OK" ? item.tone : "bg-raised text-faint"}`}
        >
          <span className="tabular-nums">{item.count}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
