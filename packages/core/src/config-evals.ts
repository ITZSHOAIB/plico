import { parseModelRef } from "./model-ref.js";
import type { ProjectConfig, ValidationIssue } from "./types.js";

/** Checks `evals` in `plico.config.ts`: `judge` is a `provider:model`. */
export function validateEvalsConfig(evals: unknown, configFile: string): ValidationIssue[] {
  const valid =
    typeof evals === "object" &&
    evals !== null &&
    !Array.isArray(evals) &&
    (!Object.hasOwn(evals, "judge") ||
      parseModelRef((evals as { judge?: unknown }).judge) !== undefined);
  return valid
    ? []
    : [
        {
          path: configFile,
          message: 'Expected evals.judge to be "<provider>:<model>", such as "openai:gpt-5-mini"',
          severity: "error",
        },
      ];
}

/** The known `evals` keys of a validated config. */
export function normalizeEvalsConfig(
  evals: NonNullable<ProjectConfig["evals"]>,
): NonNullable<ProjectConfig["evals"]> {
  return evals.judge === undefined ? {} : { judge: evals.judge };
}
