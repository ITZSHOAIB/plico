import type { PlicoEvent } from "../types";
import { JsonSection } from "./JsonSection";

/** The validated result of a run with an output schema, once its visible events reach completion. */
export function StructuredResult({ events }: { events: PlicoEvent[] }) {
  const completed = [...events].reverse().find((event) => event.type === "run.completed");
  if (completed?.type !== "run.completed" || completed.payload.structuredOutput === undefined)
    return null;
  return (
    <JsonSection
      className="px-4 pt-3 [&_pre]:max-h-48"
      title="Structured result"
      value={completed.payload.structuredOutput}
    />
  );
}
