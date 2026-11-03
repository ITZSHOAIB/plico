import type { ReadinessDiagnostic } from "../types";

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

export function ReadinessDiagnostics({ diagnostics }: { diagnostics: ReadinessDiagnostic[] }) {
  return (
    <div>
      {diagnostics.map((d, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Identical diagnostics need distinct keys.
          key={`rd-${d.subsystem}-${d.message}-${d.path}-${index}`}
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
