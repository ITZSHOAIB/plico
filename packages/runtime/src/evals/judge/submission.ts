import type { RunResult } from "../../types/index.js";

const MAX_VALUE_LENGTH = 2_000;

/** Long values are cut, with a note, so one large tool result cannot crowd out the rest. */
function shorten(text: string): string {
  if (text.length <= MAX_VALUE_LENGTH) return text;
  return `${text.slice(0, MAX_VALUE_LENGTH)} … (shortened from ${text.length} characters)`;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The case input as the judge's task or question. */
export function describeInput(input: unknown): string {
  return input === undefined ? "(no input)" : shorten(asText(input));
}

/** The run's answer: its structured output when it has one, else its text. */
export function describeOutput(run: RunResult): string {
  return shorten(
    run.structuredOutput === undefined ? (run.output ?? "") : asText(run.structuredOutput),
  );
}

/** What the agent did: its answer, each tool call with its arguments and result, and files written. */
export function describeSubmission(run: RunResult): string {
  const calls: Array<{ toolName: string; text: string; answered: boolean }> = [];
  const files: string[] = [];
  for (const event of run.events) {
    if (event.type === "tool.call") {
      const { toolName } = event.payload;
      const text = `${toolName}(${shorten(asText(event.payload.arguments ?? {}))})`;
      calls.push({ toolName, text, answered: false });
    } else if (event.type === "tool.result") {
      // Results pair with the earliest unanswered call of the same tool.
      const call = calls.find((c) => !c.answered && c.toolName === event.payload.toolName);
      if (call) {
        call.text += ` -> ${shorten(asText(event.payload.result))}`;
        call.answered = true;
      }
    } else if (event.type === "artifact.file.written") files.push(event.payload.path);
  }
  const parts = [`Answer: ${describeOutput(run) || "(no answer)"}`];
  if (calls.length > 0)
    parts.push(`Tool calls:\n${calls.map((call, i) => `${i + 1}. ${call.text}`).join("\n")}`);
  if (files.length > 0) parts.push(`Files written: ${files.join(", ")}`);
  return parts.join("\n");
}
