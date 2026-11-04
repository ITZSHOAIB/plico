import { MessageScroller } from "@shadcn/react/message-scroller";
import { ArrowDown, Bot, SquareArrowOutUpRight, UserRound } from "lucide-react";
import type { ThreadMessage } from "../../types";
import { Bubble, BubbleContent } from "../../ui/chat/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "../../ui/chat/message";
import { ChatEmpty } from "./ChatEmpty";

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
  return (
    <MessageScroller.Provider autoScroll defaultScrollPosition="end">
      <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageScroller.Viewport className="size-full min-h-0 overflow-y-auto overscroll-contain data-pending-scroll:invisible">
          <MessageScroller.Content
            className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-7 px-5 py-8 sm:px-7"
            aria-busy={running}
          >
            {loading ? (
              <p role="status" className="text-small text-muted">
                Loading messages…
              </p>
            ) : (
              messages.length === 0 && <ChatEmpty selected />
            )}
            {messages.map((message) => (
              <MessageScroller.Item
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <Message align={message.role === "user" ? "end" : "start"}>
                  <MessageAvatar
                    aria-hidden="true"
                    className={
                      message.role === "assistant"
                        ? "border border-line bg-accent-soft text-accent"
                        : "border border-line"
                    }
                  >
                    {message.role === "user" ? <UserRound size={15} /> : <Bot size={16} />}
                  </MessageAvatar>
                  <MessageContent>
                    <MessageHeader>{message.role === "user" ? "You" : "Agent"}</MessageHeader>
                    <Bubble variant={message.role === "user" ? "muted" : "ghost"}>
                      <BubbleContent>{message.content}</BubbleContent>
                    </Bubble>
                    {message.runId && (
                      <MessageFooter>
                        <button
                          type="button"
                          onClick={() => {
                            if (message.runId) onInspect(message.runId);
                          }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border-0 bg-transparent p-0 text-faint transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          Inspect run <SquareArrowOutUpRight size={12} aria-hidden="true" />
                        </button>
                      </MessageFooter>
                    )}
                  </MessageContent>
                </Message>
              </MessageScroller.Item>
            ))}
            {showLive && (
              <MessageScroller.Item messageId={`live-${runId}`}>
                <Message>
                  <MessageAvatar
                    className="border border-line bg-accent-soft text-accent"
                    aria-hidden="true"
                  >
                    <Bot size={16} />
                  </MessageAvatar>
                  <MessageContent>
                    <MessageHeader>
                      Agent{" "}
                      {running && (
                        <span role="status" className="font-normal text-faint">
                          · Responding
                        </span>
                      )}
                    </MessageHeader>
                    <Bubble variant="ghost">
                      <BubbleContent>
                        {output || (running ? "Thinking…" : "No response.")}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScroller.Item>
            )}
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button
          direction="end"
          aria-label="Scroll to latest message"
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-small text-fg shadow-sm data-[active=false]:pointer-events-none data-[active=false]:opacity-0"
        >
          <ArrowDown size={14} aria-hidden="true" />
          Latest
        </MessageScroller.Button>
      </MessageScroller.Root>
    </MessageScroller.Provider>
  );
}
