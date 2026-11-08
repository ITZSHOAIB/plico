import { useRef, useState } from "react";
import { fetchRun, requestRunCancellation } from "../api";
import { ChatComposer } from "../components/chat/ChatComposer";
import { ChatEmpty } from "../components/chat/ChatEmpty";
import { ChatAnnouncer, ChatHeader } from "../components/chat/ChatHeader";
import { ChatInspector } from "../components/chat/ChatInspector";
import { ChatThreads } from "../components/chat/ChatThreads";
import { ChatTranscript } from "../components/chat/ChatTranscript";
import { threadLabel } from "../components/chat/threadLabel";
import { useChat } from "../hooks/useChat";
import { type RunInspector, useRunInspector } from "../hooks/useRunInspector";
import type { PlicoEvent } from "../types";
import { Notice } from "../ui/Page";

function liveText(events: PlicoEvent[]): string {
  const turns = new Map<number, { attempt: string; text: string }>();
  for (const event of events) {
    if (event.type === "model.attempt")
      turns.set(event.payload.turn, { attempt: event.payload.attemptId, text: "" });
    if (event.type === "model.delta") {
      const turn = turns.get(event.payload.turn);
      if (turn?.attempt === event.payload.attemptId) turn.text += event.payload.text;
    }
  }
  return [...turns.values()].map((turn) => turn.text).join("");
}

export function ChatView({ inspector }: { inspector: RunInspector }) {
  const active = useRunInspector();
  const chat = useChat(active);
  const [draft, setDraft] = useState("");
  const [showInspector, setShowInspector] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const inspectRequest = useRef(0);
  const visibleInspector = historical ? inspector : active;
  const runId = active.selectedRun?.runId;
  const showLive =
    !!runId &&
    chat.messages.some((message) => message.role === "user" && message.runId === runId) &&
    !chat.messages.some((message) => message.role === "assistant" && message.runId === runId);
  const running =
    !!active.selectedRun && ["running", "waiting"].includes(active.selectedRun.status);

  function resetSelection() {
    inspectRequest.current++;
    setInspectError(null);
    setStopError(null);
    setInspecting(false);
    setDraft("");
    setHistorical(false);
    setShowInspector(false);
  }
  function inspect(id: string) {
    const request = ++inspectRequest.current;
    setInspectError(null);
    setShowInspector(true);
    setInspectorCollapsed(false);
    if (id === runId) {
      setHistorical(false);
      if (active.streamState === "disconnected" && active.selectedRun)
        void active.selectRun(active.selectedRun);
      return;
    }
    setInspecting(true);
    void fetchRun(id)
      .then(
        (run) => {
          if (request === inspectRequest.current) {
            setHistorical(true);
            void inspector.selectRun(run);
          }
        },
        () => {
          if (request === inspectRequest.current)
            setInspectError("Could not load the associated run.");
        },
      )
      .finally(() => {
        if (request === inspectRequest.current) setInspecting(false);
      });
  }

  const thread = chat.threads.find((item) => item.id === chat.selected);
  const stop =
    running && runId
      ? () => {
          setStopError(null);
          requestRunCancellation(runId).catch((cause) =>
            setStopError(
              cause instanceof Error ? cause.message : "Could not request run cancellation.",
            ),
          );
        }
      : undefined;

  return (
    <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
      <ChatThreads
        hiddenOnMobile={showInspector}
        threads={chat.threads}
        selected={chat.selected}
        onNew={() => {
          resetSelection();
          void chat.newThread();
        }}
        onSelect={(id) => {
          resetSelection();
          void chat.chooseThread(id);
        }}
      />
      <div
        className={`min-h-0 min-w-0 flex-1 flex-col bg-bg ${showInspector ? "hidden lg:flex" : "flex"}`}
      >
        <ChatHeader
          title={thread ? threadLabel(thread) : "Chat"}
          subtitle={
            thread
              ? `Started ${formatDate(thread.createdAt)}`
              : "Try your agent and inspect every run"
          }
          run={active.selectedRun}
          inspectorCollapsed={inspectorCollapsed}
          onExpandInspector={() => setInspectorCollapsed(false)}
          onOpenInspector={() => setShowInspector(true)}
          {...(thread ? { onRename: (title: string) => chat.rename(thread.id, title) } : {})}
        />
        <ChatAnnouncer running={running} />
        {(chat.error || inspectError || stopError) && (
          <div className="mx-auto w-full max-w-3xl px-5 pt-4">
            <Notice>{chat.error ?? inspectError ?? stopError}</Notice>
          </div>
        )}
        {!chat.selected ? (
          <ChatEmpty selected={false} onNew={() => void chat.newThread()} />
        ) : (
          <>
            <ChatTranscript
              messages={chat.messages}
              loading={chat.loading}
              running={running}
              runId={runId}
              output={showLive ? liveText(active.events) : ""}
              showLive={showLive}
              onInspect={inspect}
            />
            {active.streamState === "reconnecting" && (
              <p
                role="status"
                className="mx-auto my-0 w-full max-w-3xl px-6 text-small text-warning"
              >
                Reconnecting to run updates…
              </p>
            )}
            {active.streamState === "disconnected" && (
              <p role="alert" className="mx-auto my-0 w-full max-w-3xl px-6 text-small text-danger">
                Disconnected. Select the run to retry.
              </p>
            )}
            <ChatComposer
              draft={draft}
              setDraft={setDraft}
              disabled={chat.sending || chat.loading || running}
              onStop={stop}
              onSubmit={() => {
                const text = draft;
                setHistorical(false);
                void chat.send(text).then((sent) => {
                  if (sent) setDraft((current) => (current === text ? "" : current));
                });
              }}
            />
          </>
        )}
      </div>
      <ChatInspector
        inspector={visibleInspector}
        inspecting={inspecting}
        mobileOpen={showInspector}
        collapsed={inspectorCollapsed}
        onClose={() => setShowInspector(false)}
        onCollapse={() => setInspectorCollapsed(true)}
      />
    </section>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
