import { emptyPanel, heading, metaLoose, panel } from "../styles";
import type { ReadinessReport } from "../types";

function severityColor(severity: string): string {
  if (severity === "error") return "#c00";
  if (severity === "warning") return "#b60";
  return "#080";
}

function severityBackground(severity: string): string {
  if (severity === "error") return "#fff0f0";
  if (severity === "warning") return "#fff8f0";
  return "#f0fff0";
}

function severityLabel(severity: string): string {
  if (severity === "error") return "ERROR";
  if (severity === "warning") return "WARN";
  return "OK";
}

export function ReadinessView({ report }: { report: ReadinessReport | null }) {
  if (!report) {
    return <div style={emptyPanel}>Loading readiness report…</div>;
  }

  return (
    <div style={panel}>
      <h3 style={heading}>Local Readiness Report</h3>
      <div style={metaLoose}>
        {report.summary.ok} ok, {report.summary.warning} warning(s), {report.summary.error} error(s)
      </div>
      {report.diagnostics.map((d) => (
        <div
          key={`rd-${d.subsystem}-${d.message}`}
          style={{
            padding: "6px 8px",
            marginBottom: "4px",
            borderRadius: "3px",
            border: `1px solid ${severityColor(d.severity)}`,
            background: severityBackground(d.severity),
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: 500 }}>
            <span style={{ color: severityColor(d.severity) }}>{severityLabel(d.severity)}</span>{" "}
            {d.subsystem}
            {d.path ? ` [${d.path}]` : ""}
          </div>
          <div style={{ marginTop: "2px", color: "#333" }}>{d.message}</div>
        </div>
      ))}
    </div>
  );
}
