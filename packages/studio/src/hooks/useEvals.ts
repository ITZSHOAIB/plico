import type { EvalReportV2 } from "@plico-ai/contracts";
import { useCallback, useEffect, useState } from "react";
import { fetchEvalReports, fetchLatestEvalReport, runEvals } from "../api";
import type { EvalReport } from "../types";

export function useEvals(onEvalsFinished: () => Promise<void>) {
  const [report, setReport] = useState<EvalReport | EvalReportV2 | null>(null);
  const [reports, setReports] = useState<EvalReportV2[]>([]);
  const [selected, setSelected] = useState<EvalReportV2["results"][number] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([fetchLatestEvalReport(), fetchEvalReports()])
      .then(([legacy, history]) => {
        setReports(history);
        setReport(history[0] ?? legacy);
        setError(null);
      })
      .catch(() => setError("Could not load eval results"));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async () => {
    setRunning(true);
    setSelected(null);
    setError(null);
    try {
      await runEvals();
      await Promise.all([refresh(), onEvalsFinished()]);
    } catch {
      setError("Failed to run evals");
    } finally {
      setRunning(false);
    }
  }, [refresh, onEvalsFinished]);

  return {
    reports,
    selectReport: (id: string) => {
      setReport(reports.find((r) => r.id === id) ?? null);
      setSelected(null);
    },
    report,
    latestReport: reports[0] ?? report,
    selected,
    running,
    error,
    refresh,
    run,
    select: setSelected,
    setError,
  };
}

export type EvalsState = ReturnType<typeof useEvals>;
