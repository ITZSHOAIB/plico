import { MessageSquareText } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../ui/chat/empty";

export function ChatEmpty({ selected }: { selected: boolean }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <MessageSquareText size={21} aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {selected ? "Start a conversation" : "Your agent, ready to explore"}
        </EmptyTitle>
        <EmptyDescription>
          {selected
            ? "Send a message to start the conversation. Your agent’s reply and run activity will appear here."
            : "Create a thread or choose a conversation to try your agent and inspect each run."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
