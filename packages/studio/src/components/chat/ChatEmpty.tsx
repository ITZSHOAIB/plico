import { MessageSquareText, Plus } from "lucide-react";
import { Button } from "../../ui/Button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../ui/chat/empty";

export function ChatEmpty({ selected, onNew }: { selected: boolean; onNew?: () => void }) {
  return (
    <Empty className="animate-view-in">
      <EmptyHeader>
        <EmptyMedia>
          <MessageSquareText size={20} aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {selected ? "Start a conversation" : "Your agent, ready to explore"}
        </EmptyTitle>
        <EmptyDescription>
          {selected
            ? "Ask anything below. The reply streams in here, and every run is saved with its full event history."
            : "Open a conversation to try your agent. Each reply links to its run, so you can see exactly what happened."}
        </EmptyDescription>
      </EmptyHeader>
      {!selected && onNew && (
        <Button variant="primary" onClick={onNew}>
          <Plus size={15} aria-hidden="true" />
          Start a conversation
        </Button>
      )}
    </Empty>
  );
}
