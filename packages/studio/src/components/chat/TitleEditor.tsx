import { Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/Button";

/** The conversation title with an inline rename. Enter saves, Escape cancels. */
export function TitleEditor({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function cancel() {
    setEditing(false);
    setError(null);
  }
  async function save() {
    const next = draft.trim();
    if (!next || next === title) return cancel();
    setSaving(true);
    setError(null);
    try {
      await onRename(next);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename the conversation.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing)
    return (
      <div className="flex min-w-0 items-center gap-1">
        <h2 className="m-0 truncate text-body font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rename conversation"
          title="Rename conversation"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
        >
          <Pencil size={14} aria-hidden="true" />
        </Button>
      </div>
    );

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <input
          ref={input}
          aria-label="Conversation title"
          aria-invalid={error ? "true" : undefined}
          className="h-8 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-body font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent"
          maxLength={200}
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") cancel();
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Save title"
          disabled={saving}
          onClick={() => void save()}
        >
          <Check size={14} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel rename" onClick={cancel}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="m-0 truncate text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
