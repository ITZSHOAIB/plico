import { useState } from "react";
import { ApprovalDecision } from "../components/ApprovalDecision";
import { EventList } from "../components/EventList";
import { RunCancellation } from "../components/RunCancellation";
import { useReplayPosition } from "../hooks/useReplayPosition";
import type { StreamState } from "../hooks/useRunStream";
import type { PlicoEvent, RunSummary } from "../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CodeBlock, EmptyState, Notice, titleClass } from "../ui/Page";
import { StatusBadge } from "../ui/StatusBadge";
import { ReplayControls } from "./ReplayControls";
import { type RunTabMode, RunTabs } from "./RunTabs";

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
  const [mode, setMode] = useState<RunTabMode>("timeline");
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
      <header className="border-b border-line px-4 pt-2.5 pb-3 lg:pt-3 lg:pb-3.5">
        <div className="mb-2 flex min-w-0 items-center gap-2 lg:mb-3 lg:gap-2.5">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              aria-label="Back to runs"
              title="Back to runs"
              className="-ml-2 shrink-0 lg:hidden"
            >
              <Icon name="back" size="sm" />
            </Button>
          )}
          <h2
            className={`${titleClass} min-w-0 truncate font-mono text-body`}
            title={selectedRun.runId}
          >
            {selectedRun.runId}
          </h2>
          <StatusBadge status={shownRun.status} />
        </div>
        <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-small lg:grid lg:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] lg:gap-y-2">
          <MetaItem
            label="Started"
            value={dateTime(shownRun.startedAt)}
            title={shownRun.startedAt}
          />
          <MetaItem
            label="Ended"
            value={shownRun.endedAt ? dateTime(shownRun.endedAt) : "Not ended"}
            title={shownRun.endedAt ?? undefined}
          />
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
      {replay.isLatest && ["running", "waiting"].includes(selectedRun.status) && (
        <RunCancellation key={selectedRun.runId} runId={selectedRun.runId} />
      )}
      <RunTabs mode={mode} onChange={setMode} />
      <div
        role="tabpanel"
        id={`run-panel-${mode}`}
        aria-labelledby={`run-tab-${mode}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {mode === "timeline" ? (
          <EventList events={visibleEvents} />
        ) : (
          <div className="p-4">
            <CodeBlock>{JSON.stringify(visibleEvents, null, 2)}</CodeBlock>
          </div>
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

function MetaItem({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string | undefined;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 lg:block">
      <dt className="text-caption text-faint">{label}</dt>
      <dd className="m-0 truncate text-fg tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  );
}

function dateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
