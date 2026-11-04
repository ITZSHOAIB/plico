import { MessageSquare, Plus } from "lucide-react";
import type { Thread } from "../../types";
import { Button } from "../../ui/Button";

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
  return (
    <aside
      aria-label="Threads"
      className="flex shrink-0 flex-col border-b border-line bg-surface lg:w-60 lg:border-r lg:border-b-0"
    >
      <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-4">
        <div>
          <p className="m-0 text-caption font-semibold uppercase tracking-wider text-faint">
            Playground
          </p>
          <h2 className="m-0 mt-1 text-title font-semibold text-fg">Conversations</h2>
        </div>
        <span className="rounded-md border border-line px-2 py-0.5 text-caption text-muted">
          {threads.length}
        </span>
      </div>
      <div className="px-3 py-2">
        <Button onClick={onNew} className="w-full justify-center gap-2">
          <Plus size={15} aria-hidden="true" />
          New thread
        </Button>
      </div>
      <div className="flex min-h-0 gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto">
        {threads.map((thread) => (
          <button
            aria-label={labelForThread ? labelForThread(thread) : `Thread ${thread.id.slice(0, 8)}`}
            aria-current={selected === thread.id ? "true" : undefined}
            className="group flex min-w-40 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-left text-muted transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent aria-[current=true]:border-line aria-[current=true]:bg-raised aria-[current=true]:text-fg lg:min-w-0"
            type="button"
            key={thread.id}
            onClick={() => onSelect(thread.id)}
          >
            <MessageSquare
              size={15}
              aria-hidden="true"
              className="shrink-0 text-faint group-aria-[current=true]:text-accent"
            />
            <span className="min-w-0">
              <span className="block truncate text-small font-medium">
                {labelForThread ? labelForThread(thread) : `Thread ${thread.id.slice(0, 8)}`}
              </span>
              <span className="block truncate text-caption text-faint">
                {new Date(thread.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
          </button>
        ))}
        {threads.length === 0 && (
          <p className="hidden px-3 pt-2 text-small leading-relaxed text-faint lg:block">
            Your conversations will appear here.
          </p>
        )}
      </div>
    </aside>
  );
}
