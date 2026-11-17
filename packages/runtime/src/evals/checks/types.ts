import type { EvalExpectation, RunResult } from "../../types/index.js";

/** One finding of a check: a failure, or a check that cannot run in this mode. */
export type CheckFinding = { fail: string } | { skip: string };

/** A code check over a whole run, driven by one or more `expect` keys. */
export type EvalCheck = (expect: EvalExpectation, run: RunResult) => CheckFinding[];
