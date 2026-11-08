import { PanelRight, PanelRightOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RunSummary } from "../../types";
import { Button } from "../../ui/Button";
import { StatusBadge } from "../../ui/StatusBadge";
import { chatInspectorId } from "./ChatInspector";
import { TitleEditor } from "./TitleEditor";

export function ChatHeader({
  threadId,
  title,
  subtitle,
  run,
  inspectorCollapsed,
  onExpandInspector,
  onOpenInspector,
  onRename,
}: {
  /** Selecting another thread starts the title editor over, so a draft never follows the selection. */
  threadId?: string | undefined;
  title: string;
  subtitle: string;
  run: RunSummary | null;
  inspectorCollapsed: boolean;
  onExpandInspector: () => void;
  onOpenInspector: () => void;
  /** Without it the title is read-only, as before a thread exists. */
  onRename?: (title: string) => Promise<void>;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4 sm:px-5">
      <div className="min-w-0">
        {onRename ? (
          <TitleEditor key={threadId} title={title} onRename={onRename} />
        ) : (
          <h2 className="m-0 truncate text-body font-semibold">{title}</h2>
        )}
        <p className="m-0 truncate text-caption text-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {run && <StatusBadge status={run.status} />}
        {run && (
          <Button variant="ghost" onClick={onOpenInspector} className="lg:hidden">
            <PanelRight size={15} aria-hidden="true" />
            Inspect run
          </Button>
        )}
        {inspectorCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Show run inspector"
            title="Show run inspector"
            aria-expanded="false"
            aria-controls={chatInspectorId}
            onClick={onExpandInspector}
            className="hidden lg:inline-flex"
          >
            <PanelRightOpen size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
    </header>
  );
}

/** Tells screen readers when a reply starts and finishes, without reading every token. */
export function ChatAnnouncer({ running }: { running: boolean }) {
  const [message, setMessage] = useState("");
  const wasRunning = useRef(running);
  useEffect(() => {
    if (running && !wasRunning.current) setMessage("Agent is responding");
    if (!running && wasRunning.current) setMessage("Response complete");
    wasRunning.current = running;
  }, [running]);
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}
