import { useState } from "react";
import type { PlicoEvent, RunSummary } from "../types";
import { statusAfter } from "./runState";

export function useReplayPosition(run: RunSummary | null, events: PlicoEvent[]) {
  const [position, setPosition] = useState<number | null>(null);
  const index = position === null ? events.length - 1 : Math.min(position, events.length - 1);
  const visibleEvents = events.slice(0, index + 1);
  const shownRun =
    run && position !== null
      ? visibleEvents.reduce(statusAfter, { ...run, status: "running", endedAt: null })
      : run;
  return {
    index,
    count: events.length,
    visibleEvents,
    shownRun,
    isLatest: position === null,
    previous: () => setPosition(Math.max(0, index - 1)),
    next: () => setPosition(index + 1 >= events.length - 1 ? null : index + 1),
    latest: () => setPosition(null),
  };
}
export type ReplayPosition = ReturnType<typeof useReplayPosition>;
