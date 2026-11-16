import type { LoadedProject } from "@plico-ai/core";
import { readOutputSchema } from "../../output-schema.js";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkRunOutput(project: LoadedProject): Promise<ReadinessDiagnostic[]> {
  try {
    const schema = await readOutputSchema(project);
    return schema === undefined
      ? []
      : [
          makeDiagnostic(
            "ok",
            "run.output",
            "The agent declares structured output. Final results are validated before a run completes.",
          ),
        ];
  } catch (error) {
    return [
      makeDiagnostic("error", "run.output", error instanceof Error ? error.message : String(error)),
    ];
  }
}
