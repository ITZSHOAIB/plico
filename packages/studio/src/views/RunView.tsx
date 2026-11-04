import { useState } from "react";
import { ApprovalDecision } from "../components/ApprovalDecision";
import { EventList } from "../components/EventList";
import { useReplayPosition } from "../hooks/useReplayPosition";
import type { StreamState } from "../hooks/useRunStream";
import type { PlicoEvent, RunSummary } from "../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CodeBlock, EmptyState, Notice, titleClass } from "../ui/Page";
import { StatusBadge } from "../ui/StatusBadge";
import { ReplayControls } from "./ReplayControls";

interface RunViewProps {
  selectedRun: RunSummary | null;
  events: PlicoEvent[];
  streamState?: StreamState;
  eventsError?: string | null;
  eventsLoaded?: boolean;
  onBack?: () => void;
}

export function RunView(props: RunViewProps) {
  if (!props.selectedRun) return <EmptyState>Select a run to inspect.</EmptyState>;
  return <SelectedRunView {...props} selectedRun={props.selectedRun} />;
}

function duration(run: RunSummary): string | null {
  if (!run.endedAt) return null;
  const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  if (Number.isNaN(ms)) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function SelectedRunView({
  selectedRun,
  events,
  streamState,
  eventsError,
  eventsLoaded = true,
  onBack,
}: RunViewProps & { selectedRun: RunSummary }) {
  const [mode, setMode] = useState<"timeline" | "raw">("timeline");
  const replay = useReplayPosition(selectedRun, events);
  const { visibleEvents, shownRun } = replay;
  const error = [...visibleEvents].reverse().find((event) => event.type === "run.error");
  const reason =
    error?.payload.message ?? error?.payload.issues?.map((issue) => issue.message).join(", ");
  const toolCalls = visibleEvents.filter((event) => event.type === "tool.call").length;
  const elapsed = duration(shownRun);
  const approvalRequest =
    replay.isLatest && eventsLoaded && selectedRun.status === "waiting"
      ? pendingApproval(events)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line px-4 py-3">
        {onBack && (
          <Button
            variant="ghost"
            onClick={onBack}
            aria-label="Back to runs"
            className="-ml-2 mb-1 lg:hidden"
          >
            <Icon name="back" size="sm" />
            Runs
          </Button>
        )}
        <h2
          className={`${titleClass} mb-1.5 flex flex-wrap items-center gap-2.5 break-all font-mono`}
        >
          {selectedRun.runId}
          <StatusBadge status={shownRun.status} />
        </h2>
        <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-small text-muted">
          <MetaItem label="Started" value={shownRun.startedAt} />
          <MetaItem label="Ended" value={shownRun.endedAt ?? "Not ended"} />
          {elapsed && <MetaItem label="Duration" value={elapsed} />}
          <MetaItem label="Events" value={String(visibleEvents.length)} />
          <MetaItem label="Tool calls" value={String(toolCalls)} />
        </dl>
      </header>
      {(eventsError ||
        streamState === "disconnected" ||
        streamState === "reconnecting" ||
        (shownRun.status === "failed" && reason)) && (
        <div className="px-4 pt-3">
          {eventsError && <Notice>{eventsError}</Notice>}
          {streamState === "disconnected" && (
            <Notice>Disconnected from run updates. Reselect the run to retry.</Notice>
          )}
          {streamState === "reconnecting" && (
            <Notice tone="warning" role="status">
              Reconnecting to run updates...
            </Notice>
          )}
          {shownRun.status === "failed" && reason && (
            <Notice role="status">Failure: {reason}</Notice>
          )}
        </div>
      )}
      {approvalRequest && <ApprovalDecision runId={selectedRun.runId} request={approvalRequest} />}
      <div className="flex gap-0.5 border-b border-line px-2">
        <ModeTab active={mode === "timeline"} onClick={() => setMode("timeline")}>
          Timeline
        </ModeTab>
        <ModeTab active={mode === "raw"} onClick={() => setMode("raw")}>
          Raw events
        </ModeTab>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "timeline" ? (
          <EventList events={visibleEvents} />
        ) : (
          <section aria-label="Raw events" className="p-4">
            <CodeBlock>{JSON.stringify(visibleEvents, null, 2)}</CodeBlock>
          </section>
        )}
      </div>
      <ReplayControls replay={replay} eventsLoaded={eventsLoaded} />
    </div>
  );
}

function pendingApproval(events: PlicoEvent[]) {
  const waiting = [...events].reverse().find((event) => event.type === "run.waiting");
  if (waiting?.type !== "run.waiting") return null;
  const request = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "approval.requested" &&
        event.payload.requestId === waiting.payload.requestId,
    );
  if (request?.type !== "approval.requested") return null;
  return {
    requestId: request.payload.requestId,
    toolName: request.payload.toolName,
    arguments: request.payload.arguments,
    ...(request.payload.approval.reason === undefined
      ? {}
      : { reason: request.payload.approval.reason }),
  };
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}</dt>
      <dd className="m-0 text-fg">{value}</dd>
    </div>
  );
}

function ModeTab(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className="cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-3 h-9 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:text-fg"
    >
      {props.children}
    </button>
  );
}
