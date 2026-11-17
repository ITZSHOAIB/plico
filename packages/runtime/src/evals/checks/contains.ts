import type { EvalCheck } from "./types.js";

export const containsCheck: EvalCheck = (expect, run) => {
  const text = expect.contains ?? expect.outputContains;
  const output = run.output ?? "";
  if (text === undefined || output.includes(text)) return [];
  return [{ fail: `Expected output to contain "${text}" but got "${output}"` }];
};
