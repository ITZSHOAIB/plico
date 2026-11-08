import { ArrowLeft, PanelRightClose, ScanSearch } from "lucide-react";
import type { RunInspector } from "../../hooks/useRunInspector";
import { Button } from "../../ui/Button";
import { RunView } from "../../views/RunView";

export const chatInspectorId = "chat-run-inspector";

/** The run panel beside the conversation. On small screens it replaces the conversation. */
export function ChatInspector({
  inspector,
  inspecting,
  mobileOpen,
  collapsed,
  onClose,
  onCollapse,
}: {
  inspector: RunInspector;
  inspecting: boolean;
  mobileOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onCollapse: () => void;
}) {
  return (
    <aside
      id={chatInspectorId}
      aria-label="Run inspector"
      className={`${mobileOpen ? "flex" : "hidden"} ${collapsed ? "lg:hidden" : "lg:flex"} min-h-0 min-w-0 flex-1 flex-col border-line bg-surface lg:w-[min(44%,560px)] lg:flex-none lg:border-l`}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <Button variant="ghost" onClick={onClose} className="lg:hidden">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to chat
        </Button>
        <h2 className="m-0 hidden pl-1 text-body font-semibold lg:block">Run inspector</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hide run inspector"
          title="Hide run inspector"
          aria-expanded="true"
          aria-controls={chatInspectorId}
          onClick={onCollapse}
          className="ml-auto hidden lg:inline-flex"
        >
          <PanelRightClose size={16} aria-hidden="true" />
        </Button>
      </div>
      {inspecting && (
        <p role="status" className="m-0 px-4 py-2 text-small text-muted">
          Loading run…
        </p>
      )}
      {inspector.selectedRun ? (
        <RunView
          key={inspector.selectionKey}
          selectedRun={inspector.selectedRun}
          events={inspector.events}
          streamState={inspector.streamState}
          eventsError={inspector.eventsError}
          eventsLoaded={inspector.eventsLoaded}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-raised text-faint">
            <ScanSearch size={19} aria-hidden="true" />
          </div>
          <p className="m-0 text-body font-semibold">No run selected</p>
          <p className="mt-1.5 mb-0 max-w-60 text-small leading-relaxed text-muted">
            Send a message, or choose <span className="text-fg">Inspect run</span> on a reply, to
            follow its events, tool calls and output.
          </p>
        </div>
      )}
    </aside>
  );
}
