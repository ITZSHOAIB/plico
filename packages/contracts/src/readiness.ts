export type DiagnosticSeverity = "ok" | "warning" | "error";

export interface ReadinessDiagnostic {
  severity: DiagnosticSeverity;
  subsystem: string;
  path?: string;
  message: string;
}

export interface ReadinessReport {
  projectRoot: string;
  timestamp: string;
  diagnostics: ReadinessDiagnostic[];
  summary: {
    ok: number;
    warning: number;
    error: number;
  };
}
