import { PanelRight, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { fetchRun } from "../api";
import { ChatComposer } from "../components/chat/ChatComposer";
import { ChatEmpty } from "../components/chat/ChatEmpty";
import { ChatThreads } from "../components/chat/ChatThreads";
import { ChatTranscript } from "../components/chat/ChatTranscript";
import { useChat } from "../hooks/useChat";
import { type RunInspector, useRunInspector } from "../hooks/useRunInspector";
import type { PlicoEvent } from "../types";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Page";
import { RunView } from "./RunView";

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
  const [historical, setHistorical] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
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
    setDraft("");
    setHistorical(false);
    setShowInspector(false);
  }
  function inspect(id: string) {
    const request = ++inspectRequest.current;
    setInspectError(null);
    setShowInspector(true);
    if (id === runId) {
      setHistorical(false);
      if (active.streamState === "disconnected" && active.selectedRun)
        void active.selectRun(active.selectedRun);
      return;
    }
    void fetchRun(id).then(
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
    );
  }

  return (
    <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
      <ChatThreads
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
        className={`min-h-0 min-w-0 flex-1 flex-col ${showInspector ? "hidden lg:flex" : "flex"}`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-raised text-accent">
              <Sparkles size={16} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="m-0 truncate text-body font-semibold">Chat playground</h2>
              <p className="m-0 mt-0.5 truncate text-caption text-muted">
                {chat.selected
                  ? `Thread ${chat.selected.slice(0, 8)}`
                  : "Your project’s agent workspace"}
              </p>
            </div>
          </div>
          {visibleInspector.selectedRun && (
            <Button
              variant="ghost"
              onClick={() => setShowInspector(true)}
              className="gap-2 lg:hidden"
            >
              <PanelRight size={15} aria-hidden="true" />
              Inspect run
            </Button>
          )}
        </header>
        {(chat.error || inspectError) && (
          <div className="px-5 pt-4">
            <Notice>{chat.error ?? inspectError}</Notice>
          </div>
        )}
        {!chat.selected ? (
          <ChatEmpty selected={false} />
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
              <p role="status" className="mx-auto w-full max-w-3xl px-6 text-small text-muted">
                Reconnecting to run updates…
              </p>
            )}
            {active.streamState === "disconnected" && (
              <p role="alert" className="mx-auto w-full max-w-3xl px-6 text-small text-danger">
                Disconnected. Select the run to retry.
              </p>
            )}
            <ChatComposer
              draft={draft}
              setDraft={setDraft}
              disabled={chat.sending || chat.loading || running}
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
      <aside
        aria-label="Run inspector"
        className={`${showInspector ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col border-line bg-surface lg:flex lg:w-[38%] lg:flex-none lg:border-l`}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4">
          <Button variant="ghost" onClick={() => setShowInspector(false)} className="lg:hidden">
            Back to chat
          </Button>
          <div className="hidden size-9 place-items-center rounded-lg border border-line bg-raised text-muted lg:grid">
            <PanelRight size={16} aria-hidden="true" />
          </div>
          <div>
            <h2 className="m-0 text-body font-semibold">Run inspector</h2>
            <p className="m-0 mt-0.5 text-caption text-muted">Events, tool activity, and output</p>
          </div>
        </div>
        {visibleInspector.selectedRun ? (
          <RunView
            key={visibleInspector.selectionKey}
            selectedRun={visibleInspector.selectedRun}
            events={visibleInspector.events}
            streamState={visibleInspector.streamState}
            eventsError={visibleInspector.eventsError}
            eventsLoaded={visibleInspector.eventsLoaded}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-raised text-muted">
              <PanelRight size={20} aria-hidden="true" />
            </div>
            <p className="m-0 text-body font-semibold">Inspect a run</p>
            <p className="mt-2 max-w-56 text-small leading-relaxed text-muted">
              Send a message or select a run from the conversation to see its activity.
            </p>
          </div>
        )}
      </aside>
    </section>
  );
}
