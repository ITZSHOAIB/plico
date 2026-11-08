import { PanelRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { ChatComposer } from "../components/chat/ChatComposer";
import { ChatThreads } from "../components/chat/ChatThreads";
import { ChatTranscript } from "../components/chat/ChatTranscript";
import { ThemeToggle } from "../theme/ThemeToggle";
import type { ThreadMessage } from "../types";
import { Button } from "../ui/Button";
import { RunView } from "../views/RunView";
import { chatFixtures } from "./chat-fixture-data";

export function ChatFixtures() {
  const [selected, setSelected] = useState(chatFixtures[0]?.thread.id ?? "Completed");
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState<ThreadMessage[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const fixture = chatFixtures.find((item) => item.thread.id === selected) ?? chatFixtures[0];
  if (!fixture) return null;
  const running = fixture.run?.status === "running";

  function select(id: string) {
    setSelected(id);
    setAdded([]);
    setDraft("");
    setShowInspector(false);
  }
  function submit() {
    const content = draft.trim();
    if (!content) return;
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();
    setAdded((messages) => [
      ...messages,
      { id, threadId: selected, role: "user", content, createdAt: timestamp },
      {
        id: `${id}-reply`,
        threadId: selected,
        role: "assistant",
        content:
          "This is a simulated response for the Studio preview. No model or server was used.",
        createdAt: timestamp,
      },
    ]);
    setDraft("");
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-lg bg-primary font-mono font-bold text-on-primary">
            P
          </span>
          <span className="font-semibold">Studio chat</span>
          <span className="rounded-md border border-line px-2 py-1 text-caption text-muted">
            Dev fixtures
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-small text-muted sm:inline">
            Local preview · no provider calls
          </span>
          <ThemeToggle />
        </div>
      </header>
      <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <ChatThreads
          threads={chatFixtures.map((item) => item.thread)}
          selected={selected}
          onNew={() => select("Empty")}
          onSelect={select}
          labelForThread={(thread) => thread.id}
        />
        <div
          className={`min-h-0 min-w-0 flex-1 flex-col ${showInspector ? "hidden lg:flex" : "flex"}`}
        >
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg border border-line bg-raised text-accent">
                <Sparkles size={16} aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 text-body font-semibold">Chat playground</h1>
                <p className="m-0 mt-0.5 text-caption text-muted">{selected} example</p>
              </div>
            </div>
            {fixture.run && (
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
          <ChatTranscript
            messages={[...fixture.messages, ...added]}
            loading={false}
            running={!!running}
            runId={fixture.run?.runId}
            output={fixture.live ?? ""}
            showLive={!!fixture.live}
            onInspect={() => setShowInspector(true)}
          />
          {running && (
            <p role="status" className="mx-auto w-full max-w-3xl px-6 text-small text-muted">
              Streaming preview · select another thread to explore more states.
            </p>
          )}
          <ChatComposer
            draft={draft}
            setDraft={setDraft}
            disabled={!!running}
            onSubmit={submit}
            notice="Preview messages stay in this page and are not saved."
          />
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
              <p className="m-0 mt-0.5 text-caption text-muted">
                Events, tool activity, and output
              </p>
            </div>
          </div>
          <RunView
            key={selected}
            selectedRun={fixture.run}
            events={fixture.events}
            eventsLoaded
            streamState={running ? "connected" : "finished"}
          />
        </aside>
      </section>
    </div>
  );
}
