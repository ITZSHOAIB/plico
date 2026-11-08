import { MessageScroller } from "@shadcn/react/message-scroller";
import { ArrowDown } from "lucide-react";
import type { ThreadMessage } from "../../types";
import { ChatEmpty } from "./ChatEmpty";
import { AssistantMessage, UserMessage } from "./ChatMessages";

/** A run's reply keeps one identity from first token to saved message, so it never remounts. */
function itemKey(message: { id: string; role: string; runId?: string | undefined }): string {
  return message.role === "assistant" && message.runId ? `reply-${message.runId}` : message.id;
}

export function ChatTranscript({
  messages,
  loading,
  running,
  runId,
  output,
  showLive,
  onInspect,
}: {
  messages: ThreadMessage[];
  loading: boolean;
  running: boolean;
  runId: string | undefined;
  output: string;
  showLive: boolean;
  onInspect: (id: string) => void;
}) {
  const items = messages.map((message) => {
    const key = itemKey(message);
    return (
      <MessageScroller.Item key={key} messageId={key} scrollAnchor={message.role === "user"}>
        {message.role === "user" ? (
          <UserMessage content={message.content} runId={message.runId} onInspect={onInspect} />
        ) : (
          <AssistantMessage
            content={message.content}
            streaming={false}
            live={false}
            runId={message.runId}
            onInspect={onInspect}
          />
        )}
      </MessageScroller.Item>
    );
  });
  if (showLive) {
    const key = itemKey({ id: `live-${runId}`, role: "assistant", runId });
    items.push(
      <MessageScroller.Item key={key} messageId={key}>
        <AssistantMessage
          content={output}
          streaming={running}
          live
          runId={runId}
          onInspect={onInspect}
        />
      </MessageScroller.Item>,
    );
  }

  return (
    <MessageScroller.Provider autoScroll defaultScrollPosition="end">
      <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageScroller.Viewport
          aria-label="Conversation"
          className="size-full min-h-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent data-pending-scroll:invisible"
        >
          <MessageScroller.Content
            className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8"
            aria-busy={running}
          >
            {loading ? (
              <TranscriptSkeleton />
            ) : (
              messages.length === 0 && !showLive && <ChatEmpty selected />
            )}
            {items}
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button
          direction="end"
          aria-label="Scroll to latest message"
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-small font-medium text-fg shadow-elevated backdrop-blur transition-[opacity,transform] duration-200 hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent data-[active=false]:pointer-events-none data-[active=false]:translate-y-2 data-[active=false]:opacity-0"
        >
          <ArrowDown size={14} aria-hidden="true" />
          Latest
        </MessageScroller.Button>
      </MessageScroller.Root>
    </MessageScroller.Provider>
  );
}

function TranscriptSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">Loading messages…</span>
      <div aria-hidden="true" className="skeleton ml-auto h-10 w-2/5 rounded-xl" />
      <div aria-hidden="true" className="flex gap-3">
        <div className="skeleton size-8 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="skeleton h-3.5 w-11/12 rounded" />
          <div className="skeleton h-3.5 w-4/5 rounded" />
          <div className="skeleton h-3.5 w-3/5 rounded" />
        </div>
      </div>
    </div>
  );
}
