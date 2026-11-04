import type { ReadinessDiagnostic } from "../types";
import { Icon, type IconName } from "../ui/Icon";

const severities: Record<string, { label: string; icon: IconName; tone: string }> = {
  error: { label: "ERROR", icon: "error", tone: "border-danger/40 bg-danger-soft text-danger" },
  warning: {
    label: "WARN",
    icon: "warning",
    tone: "border-warning/40 bg-warning-soft text-warning",
  },
  ok: { label: "OK", icon: "ok", tone: "border-line bg-surface text-success" },
};

export function ReadinessDiagnostics({ diagnostics }: { diagnostics: ReadinessDiagnostic[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {diagnostics.map((d, index) => {
        const severity = severities[d.severity] ?? severities.ok;
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Identical diagnostics need distinct keys.
            key={`rd-${d.subsystem}-${d.message}-${d.path}-${index}`}
            className={`rounded-panel border px-3 py-2 ${severity?.tone ?? ""}`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Icon name={severity?.icon ?? "ok"} size="sm" />
              <span>{severity?.label}</span>
              <span className="min-w-0 break-words text-fg">
                {d.subsystem}
                {d.path ? ` [${d.path}]` : ""}
              </span>
            </div>
            <div className="mt-1 text-muted">{d.message}</div>
          </li>
        );
      })}
    </ul>
  );
}
