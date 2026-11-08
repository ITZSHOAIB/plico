import type { ReadinessDiagnostic } from "../types";
import { Icon, type IconName } from "../ui/Icon";
import { panelClass } from "../ui/Page";

const severities: Record<string, { label: string; icon: IconName; tone: string }> = {
  error: { label: "Error", icon: "error", tone: "text-danger" },
  warning: { label: "Warning", icon: "warning", tone: "text-warning" },
  ok: { label: "OK", icon: "ok", tone: "text-success" },
};

export function ReadinessDiagnostics({ diagnostics }: { diagnostics: ReadinessDiagnostic[] }) {
  return (
    <ul className={`m-0 list-none overflow-hidden p-0 ${panelClass}`}>
      {diagnostics.map((d, index) => {
        const severity = severities[d.severity] ?? severities.ok;
        const attention = d.severity === "error" || d.severity === "warning";
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Identical diagnostics need distinct keys.
            key={`rd-${d.subsystem}-${d.message}-${d.path}-${index}`}
            className={`grid grid-cols-[1rem_1fr] gap-x-3 border-b border-line-subtle px-4 py-3 last:border-b-0 ${attention ? (d.severity === "error" ? "bg-danger-soft/60" : "bg-warning-soft/60") : ""}`}
          >
            <span className={`pt-0.5 ${severity?.tone ?? ""}`}>
              <Icon name={severity?.icon ?? "ok"} size="sm" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="sr-only">{severity?.label}:</span>
                <span className="font-mono text-small font-medium text-fg">{d.subsystem}</span>
                {d.path && (
                  <span className="min-w-0 truncate font-mono text-caption text-faint">
                    {d.path}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-body text-muted">{d.message}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
