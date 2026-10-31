import type { ReadinessDiagnostic } from "../types/index.js";

export function makeDiagnostic(
  severity: ReadinessDiagnostic["severity"],
  subsystem: string,
  message: string,
  path?: string,
): ReadinessDiagnostic {
  const result: ReadinessDiagnostic = { severity, subsystem, message };
  if (path !== undefined) {
    result.path = path;
  }
  return result;
}
