import { JsonSection } from "../components/JsonSection";
import type { AgentSchemas, ComposedInstructions } from "../types";
import { CodeBlock, Page } from "../ui/Page";

export function InstructionsView({
  instructions,
  schemas = {},
}: {
  instructions: ComposedInstructions;
  schemas?: AgentSchemas;
}) {
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
      {schemas.input && <JsonSection className="mt-6" title="Input schema" value={schemas.input} />}
      {schemas.output && (
        <JsonSection className="mt-6" title="Output schema" value={schemas.output} />
      )}
    </Page>
  );
}
