import { SquareArrowOutUpRight } from "lucide-react";
import { useSmoothText } from "../../hooks/useSmoothText";
import { Bubble, BubbleContent } from "../../ui/chat/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "../../ui/chat/message";
import { CopyButton, Markdown } from "../../ui/Markdown";
import { AgentMark } from "./AgentMark";

function InspectButton({ runId, onInspect }: { runId: string; onInspect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onInspect(runId)}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control border-0 bg-transparent px-1.5 text-caption text-faint transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      Inspect run <SquareArrowOutUpRight size={12} aria-hidden="true" />
    </button>
  );
}

export function UserMessage({
  content,
  runId,
  onInspect,
}: {
  content: string;
  runId?: string | undefined;
  onInspect: (id: string) => void;
}) {
  return (
    <Message align="end" aria-label="You" className="animate-message-in">
      <MessageContent>
        <Bubble variant="muted">
          <BubbleContent>{content}</BubbleContent>
        </Bubble>
        {runId && (
          <MessageFooter className="opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
            <InspectButton runId={runId} onInspect={onInspect} />
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

export function AssistantMessage({
  content,
  streaming,
  live,
  runId,
  onInspect,
}: {
  content: string;
  /** The run is still producing this reply. */
  streaming: boolean;
  /** The reply comes from the run's event stream rather than the saved thread. */
  live: boolean;
  runId?: string | undefined;
  onInspect: (id: string) => void;
}) {
  const shown = useSmoothText(content, streaming);
  const thinking = streaming && !content;
  return (
    <Message aria-label="Agent" className="animate-message-in">
      <MessageAvatar aria-hidden="true" className="mt-0.5">
        <AgentMark active={streaming} />
      </MessageAvatar>
      <MessageContent className="pt-1">
        <MessageHeader className="sr-only">Agent</MessageHeader>
        {thinking ? (
          <ThinkingIndicator />
        ) : content ? (
          <Markdown text={shown} streaming={streaming} />
        ) : (
          <p className="m-0 text-muted italic">{live ? "No response." : "Empty reply."}</p>
        )}
        {!streaming && (content || runId) && (
          <MessageFooter className="-ml-1.5 gap-0.5">
            {content && <CopyButton text={() => content} label="Copy reply" />}
            {runId && <InspectButton runId={runId} onInspect={onInspect} />}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex h-7 items-center gap-2.5 text-muted">
      <span className="sr-only">Agent is thinking</span>
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className="thinking-dot" />
        <span className="thinking-dot [animation-delay:150ms]" />
        <span className="thinking-dot [animation-delay:300ms]" />
      </span>
      <span aria-hidden="true" className="shimmer-text text-small">
        Thinking
      </span>
    </div>
  );
}
