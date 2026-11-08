import type { ComposedInstructions } from "../types";
import { CodeBlock, Page } from "../ui/Page";

export function InstructionsView({ instructions }: { instructions: ComposedInstructions }) {
  return (
    <Page
      label="Instructions"
      title="Composed Instructions"
      subtitle={`Sources: ${instructions.sources.join(", ")}`}
    >
      <p className="mt-0 mb-3 text-small text-muted">
        The system prompt your agent receives, composed from its Markdown files in order.
      </p>
      <CodeBlock className="text-fg">{instructions.content}</CodeBlock>
    </Page>
  );
}
