import { artifactsCheck } from "./artifacts.js";
import { budgetsCheck } from "./budgets.js";
import { containsCheck } from "./contains.js";
import { outputCheck } from "./output.js";
import { statusCheck } from "./status.js";
import { toolsCheck } from "./tools.js";
import type { EvalCheck } from "./types.js";

export { tokensUsed } from "./budgets.js";
export type { CheckFinding, EvalCheck, EvalMode } from "./types.js";

/** The `expect` checks, in the order their findings are reported. */
export const EVAL_CHECKS: readonly EvalCheck[] = [
  statusCheck,
  containsCheck,
  toolsCheck,
  artifactsCheck,
  outputCheck,
  budgetsCheck,
];
