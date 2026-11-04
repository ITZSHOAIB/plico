import { ArrowUp } from "lucide-react";
import { Button } from "../../ui/Button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../ui/chat/input-group";

export function ChatComposer({
  draft,
  setDraft,
  disabled,
  onSubmit,
  notice = "Responses and run activity are saved to this project.",
}: {
  draft: string;
  setDraft: (value: string) => void;
  disabled: boolean;
  onSubmit: () => void;
  notice?: string;
}) {
  return (
    <form
      className="shrink-0 px-4 pb-5 pt-3 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && draft.trim()) onSubmit();
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
            placeholder="Ask your agent anything about this project…"
          />
          <InputGroupAddon>
            <span className="hidden sm:inline">
              Enter to send <span className="px-1 text-faint">·</span> Shift + Enter for a new line
            </span>
            <span className="sm:hidden">Message your agent</span>
            <Button
              variant="primary"
              type="submit"
              disabled={disabled || !draft.trim()}
              className="ml-auto h-9 gap-2 px-3"
            >
              <span>Send</span>
              <ArrowUp aria-hidden="true" size={15} />
            </Button>
          </InputGroupAddon>
        </InputGroup>
        <p className="mb-0 mt-2 text-center text-caption text-faint">{notice}</p>
      </div>
    </form>
  );
}
