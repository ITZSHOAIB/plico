import { codeBlockScroll, heading, meta, panel } from "../styles";
import type { ComposedInstructions } from "../types";

export function InstructionsView({ instructions }: { instructions: ComposedInstructions }) {
  return (
    <div style={panel}>
      <h3 style={heading}>Composed Instructions</h3>
      <div style={meta}>Sources: {instructions.sources.join(", ")}</div>
      <pre style={codeBlockScroll("80vh")}>{instructions.content}</pre>
    </div>
  );
}
