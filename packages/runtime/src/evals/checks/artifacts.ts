import type { EvalCheck } from "./types.js";

export const artifactsCheck: EvalCheck = (expect, run) => {
  const written = new Set(
    run.events.flatMap((event) =>
      event.type === "artifact.file.written" ? [event.payload.path] : [],
    ),
  );
  return (expect.artifact ?? [])
    .filter((path) => !written.has(path))
    .map((path) => ({ fail: `Artifact "${path}" was not written.` }));
};
