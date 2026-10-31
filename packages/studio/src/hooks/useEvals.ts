import { useCallback, useEffect, useState } from "react";
import { fetchLatestEvalReport, runEvals } from "../api";
import type { EvalCaseResult, EvalReport } from "../types";

export function useEvals(onEvalsFinished: () => Promise<void>) {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [selected, setSelected] = useState<EvalCaseResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await fetchLatestEvalReport()
      .then(setReport)
      .catch(() => setReport(null));
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

  return { report, selected, running, error, refresh, run, select: setSelected, setError };
}

export type EvalsState = ReturnType<typeof useEvals>;
