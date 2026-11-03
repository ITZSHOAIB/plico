import { emptyPanel } from "../styles";

export function ReadinessError({ error, hasReport }: { error: string; hasReport: boolean }) {
  return (
    <div role="alert" style={hasReport ? undefined : emptyPanel}>
      {error}
      {hasReport && ". Showing the last successful report."}
    </div>
  );
}
