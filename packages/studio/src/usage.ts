import type { PlicoEvent } from "./types";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Input and output tokens the model reported across a run's events. */
export function sumUsage(events: readonly PlicoEvent[]): TokenUsage {
  const total: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  for (const event of events) {
    if (event.type !== "model.response") continue;
    // Events stored by older versions may carry no usage.
    const usage = event.payload.usage as TokenUsage | undefined;
    total.inputTokens += usage?.inputTokens ?? 0;
    total.outputTokens += usage?.outputTokens ?? 0;
  }
  return total;
}

/** `42 in · 10 out`, or `null` when no tokens were used. */
export function formatUsage(usage: TokenUsage): string | null {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return null;
  return `${usage.inputTokens} in · ${usage.outputTokens} out`;
}
