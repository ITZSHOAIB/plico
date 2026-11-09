import { useEffect, useState } from "react";
import { fetchEvents } from "../api";
import type { ThreadMessage } from "../types";
import { sumUsage, type TokenUsage } from "../usage";

/**
 * Input and output tokens across every run in a thread. It reads each run's events again when the
 * set of runs changes or a reply finishes, so the total follows the conversation.
 */
export function useThreadUsage(
  threadId: string | undefined,
  messages: readonly ThreadMessage[],
  running: boolean,
): TokenUsage | null {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const runIds = [...new Set(messages.map((message) => message.runId).filter(Boolean))].join(",");

  useEffect(() => {
    let current = true;
    if (!threadId || !runIds || running) {
      if (!runIds) setUsage(null);
      return;
    }
    Promise.all(runIds.split(",").map((runId) => fetchEvents(runId))).then(
      (lists) => {
        if (current) setUsage(sumUsage(lists.flat()));
      },
      () => {
        if (current) setUsage(null);
      },
    );
    return () => {
      current = false;
    };
  }, [threadId, runIds, running]);

  return usage;
}
