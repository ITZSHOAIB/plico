import type { EvalReportV2 } from "@plico-ai/contracts";
import { useState } from "react";
import { EvalTrials } from "./EvalCaseScores";
import { EvalComparison } from "./EvalComparison";

export function EvalReportHistory({
  reports,
  report,
  selectReport,
}: {
  reports: EvalReportV2[];
  report: EvalReportV2;
  selectReport: (id: string) => void;
}) {
  const [compareId, setCompareId] = useState("");
  const comparison = reports.find((r) => r.id === compareId && r.id !== report.id);
  const inputClass =
    "mt-1 block w-full rounded-control border border-line bg-surface p-2 text-small text-fg";
  return (
    <div className="mb-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Eval report
          <select
            className={inputClass}
            value={report.id}
            onChange={(e) => selectReport(e.target.value)}
          >
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.evaluatedAt} · {r.mode} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Compare with
          <select
            className={inputClass}
            value={comparison?.id ?? ""}
            onChange={(e) => setCompareId(e.target.value)}
          >
            <option value="">No comparison</option>
            {reports
              .filter((r) => r.id !== report.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.evaluatedAt} · {r.mode} · {r.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
      </div>
      {comparison && <EvalComparison before={report} after={comparison} />}
      {report.skipped.map((entry) => (
        <details key={entry.name} className="my-3 rounded-control border border-line p-3">
          <summary>
            SKIP {entry.name}: {entry.reason}
          </summary>
          <EvalTrials trials={entry.completedTrials} />
        </details>
      ))}
      {report.tokenCapReached && (
        <p className="text-danger">Token cap reached. This report is incomplete.</p>
      )}
    </div>
  );
}
