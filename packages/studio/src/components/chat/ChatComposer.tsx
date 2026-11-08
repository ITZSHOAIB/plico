import { ArrowUp, Square } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../ui/chat/input-group";

const roundButton =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition-[background-color,color,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95";

export function ChatComposer({
  draft,
  setDraft,
  disabled,
  onSubmit,
  onStop,
  notice = "Replies and run activity are saved to this project.",
}: {
  draft: string;
  setDraft: (value: string) => void;
  disabled: boolean;
  onSubmit: () => void;
  /** Shown instead of Send while a reply is streaming. */
  onStop?: (() => void) | undefined;
  notice?: string;
}) {
  const canSend = !disabled && !!draft.trim();
  return (
    <form
      className="shrink-0 px-4 pt-2 pb-4 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="mx-auto max-w-3xl">
        <InputGroup>
          <InputGroupTextarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Message your agent…"
          />
          <InputGroupAddon>
            <span className="hidden items-center gap-1.5 text-caption text-faint sm:flex">
              <kbd className="kbd">Enter</kbd> to send
              <span aria-hidden="true" className="px-0.5">
                ·
              </span>
              <kbd className="kbd">Shift</kbd>
              <span aria-hidden="true">+</span>
              <kbd className="kbd">Enter</kbd> for a new line
            </span>
            {onStop ? (
              <button
                type="button"
                aria-label="Stop response"
                title="Stop response"
                onClick={onStop}
                className={`${roundButton} ml-auto bg-primary text-on-primary hover:bg-primary-hover`}
              >
                <Square size={11} fill="currentColor" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send"
                title="Send"
                disabled={!canSend}
                className={`${roundButton} ml-auto bg-primary text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:active:scale-100`}
              >
                <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
              </button>
            )}
          </InputGroupAddon>
        </InputGroup>
        <p className="mt-2 mb-0 text-center text-caption text-faint">{notice}</p>
      </div>
    </form>
  );
}
