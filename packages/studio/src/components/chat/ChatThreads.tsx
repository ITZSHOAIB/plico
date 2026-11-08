import { MessageSquare, Plus } from "lucide-react";
import type { Thread } from "../../types";
import { Button } from "../../ui/Button";

function threadDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ChatThreads({
  threads,
  selected,
  onNew,
  onSelect,
  labelForThread,
}: {
  threads: Thread[];
  selected: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  labelForThread?: (thread: Thread) => string;
}) {
  // Newest first: the conversation you just started sits at the top.
  const ordered = [...threads].reverse();
  return (
    <aside
      aria-label="Threads"
      className="flex shrink-0 flex-col border-b border-line bg-surface lg:w-64 lg:border-r lg:border-b-0"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 lg:border-b lg:border-line">
        <h2 className="m-0 flex items-center gap-2 text-body font-semibold">
          Conversations
          <span className="rounded-full bg-raised px-1.5 text-caption font-medium text-muted tabular-nums">
            <span className="sr-only">(</span>
            {threads.length}
            <span className="sr-only">)</span>
          </span>
        </h2>
        <Button variant="primary" size="sm" onClick={onNew}>
          <Plus size={14} aria-hidden="true" />
          New thread
        </Button>
      </div>
      <ul className="m-0 flex min-h-0 list-none gap-1 overflow-x-auto p-2 lg:flex-1 lg:flex-col lg:overflow-y-auto">
        {ordered.map((thread) => {
          const label = labelForThread ? labelForThread(thread) : `Thread ${thread.id.slice(0, 8)}`;
          const dateId = `thread-date-${thread.id}`;
          return (
            <li key={thread.id} className="shrink-0 lg:shrink">
              <button
                aria-current={selected === thread.id ? "true" : undefined}
                aria-describedby={dateId}
                className="group relative flex w-full min-w-40 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-muted transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=true]:bg-raised aria-[current=true]:text-fg lg:min-w-0"
                type="button"
                onClick={() => onSelect(thread.id)}
              >
                <MessageSquare
                  size={15}
                  aria-hidden="true"
                  className="shrink-0 text-faint group-aria-[current=true]:text-accent"
                />
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium">{label}</span>
                  <span
                    id={dateId}
                    aria-hidden="true"
                    className="block truncate text-caption text-faint"
                  >
                    {threadDate(thread.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {threads.length === 0 && (
          <li className="hidden px-2.5 pt-2 text-small leading-relaxed text-faint lg:block">
            No conversations yet. Start one to try your agent.
          </li>
        )}
      </ul>
    </aside>
  );
}
