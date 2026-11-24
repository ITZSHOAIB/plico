import type { ToolInspection } from "../types";
import { EmptyState, Page, panelClass } from "../ui/Page";

export function ToolsView({
  report,
  error,
}: {
  report: { tools: ToolInspection[] } | null;
  error: string | null;
}) {
  if (error) return <EmptyState alert>{error}</EmptyState>;
  if (!report) return <EmptyState>Loading tools…</EmptyState>;

  return (
    <Page
      label="Tools"
      title="Tools"
      subtitle="Declared and MCP tools with the approval policy Plico will apply."
    >
      {report.tools.length === 0 ? (
        <p className="text-body text-muted">No tools declared.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {report.tools.map((tool) => (
            <li key={tool.name} className={`${panelClass} p-4`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <code className="font-mono text-body font-semibold text-fg">{tool.name}</code>
                <code className="font-mono text-small text-muted">{tool.source}</code>
                <span
                  className={`text-caption font-semibold ${tool.approval.required ? "text-warning" : "text-muted"}`}
                >
                  {tool.approval.required ? "Requires approval" : "No approval required"}
                </span>
              </div>
              <p className="mt-2 mb-0 text-small text-muted">{tool.description}</p>
              {tool.approval.reason && (
                <p className="mt-1 mb-0 text-small text-muted">{tool.approval.reason}</p>
              )}
              {tool.mcp && (
                <p className="mt-1 mb-0 text-small text-muted">
                  MCP server <code>{tool.mcp.serverId}</code>, tool <code>{tool.mcp.toolName}</code>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
