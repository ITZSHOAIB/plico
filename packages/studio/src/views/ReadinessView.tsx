import { ReadinessDiagnostics } from "../components/ReadinessDiagnostics";
import { ReadinessError } from "../components/ReadinessError";
import { ReadinessSummary, readinessSummaryText } from "../components/ReadinessSummary";
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
      label="Readiness"
      title="Local Readiness Report"
      subtitle={readinessSummaryText(report.summary)}
    >
      {error && <ReadinessError error={error} hasReport />}
      <ReadinessSummary summary={report.summary} />
      <ReadinessDiagnostics diagnostics={report.diagnostics} />
    </Page>
  );
}
