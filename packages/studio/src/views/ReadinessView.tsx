import { ReadinessDiagnostics } from "../components/ReadinessDiagnostics";
import { ReadinessError } from "../components/ReadinessError";
import type { ReadinessReport } from "../types";
import { EmptyState, Page } from "../ui/Page";

export function ReadinessView({
  report,
  error,
}: {
  report: ReadinessReport | null;
  error: string | null;
}) {
  if (!report && error) return <ReadinessError error={error} hasReport={false} />;
  if (!report) {
    return <EmptyState>Loading readiness report…</EmptyState>;
  }

  return (
    <Page
      title="Local Readiness Report"
      subtitle={`${report.summary.ok} ok, ${report.summary.warning} warning(s), ${report.summary.error} error(s)`}
    >
      {error && <ReadinessError error={error} hasReport />}
      <ReadinessDiagnostics diagnostics={report.diagnostics} />
    </Page>
  );
}
