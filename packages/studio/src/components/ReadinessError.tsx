import { EmptyState, Notice } from "../ui/Page";

export function ReadinessError({ error, hasReport }: { error: string; hasReport: boolean }) {
  if (!hasReport) return <EmptyState alert>{error}</EmptyState>;
  return <Notice>{`${error}. Showing the last successful report.`}</Notice>;
}
