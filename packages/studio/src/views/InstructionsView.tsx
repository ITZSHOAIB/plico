import type { ComposedInstructions } from "../types";
import { CodeBlock, Page } from "../ui/Page";

export function InstructionsView({ instructions }: { instructions: ComposedInstructions }) {
  return (
    <Page title="Composed Instructions" subtitle={`Sources: ${instructions.sources.join(", ")}`}>
      <CodeBlock className="text-fg">{instructions.content}</CodeBlock>
    </Page>
  );
}
