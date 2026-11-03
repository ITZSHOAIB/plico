import { ReadinessDiagnostics } from "../components/ReadinessDiagnostics";
import { emptyPanel, heading, metaLoose, panel } from "../styles";
import type { ReadinessReport } from "../types";

export function ReadinessView({
  report,
  error,
}: {
  report: ReadinessReport | null;
  error: string | null;
}) {
  if (!report && error)
    return (
      <div role="alert" style={emptyPanel}>
        {error}
      </div>
    );
  if (!report) {
    return <div style={emptyPanel}>Loading readiness report…</div>;
  }

  return (
    <div style={panel}>
      <h3 style={heading}>Local Readiness Report</h3>
      {error && <div role="alert">{error}. Showing the last successful report.</div>}
      <div style={metaLoose}>
        {report.summary.ok} ok, {report.summary.warning} warning(s), {report.summary.error} error(s)
      </div>
      <ReadinessDiagnostics diagnostics={report.diagnostics} />
    </div>
  );
}
