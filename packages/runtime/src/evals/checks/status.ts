import type { EvalCheck } from "./types.js";

export const statusCheck: EvalCheck = (expect, run) => {
  if (expect.status !== undefined && run.status !== expect.status)
    return [{ fail: `Expected status "${expect.status}" but got "${run.status}"` }];
  if (expect.status === undefined && run.status !== "completed")
    return [{ fail: `Run ended with status "${run.status}"` }];
  return [];
};
