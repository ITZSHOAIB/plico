import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRun } from "../api";
import type { RunSummary } from "../types";

export function useRunUrl(
  inspectRun: (run: RunSummary) => Promise<void>,
  onSelect: () => void,
  loadRuns: () => Promise<void>,
  setEvalError: (error: string | null) => void,
) {
  const generation = useRef(0);
  const [openError, setOpenError] = useState<string | null>(null);

  const clearRunUrl = useCallback(() => {
    generation.current++;
    setOpenError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
  }, []);

  const selectRun = useCallback(
    (run: RunSummary) => {
      generation.current++;
      setOpenError(null);
      const url = new URL(window.location.href);
      url.searchParams.set("run", run.runId);
      window.history.replaceState(null, "", url);
      onSelect();
      return inspectRun(run);
    },
    [inspectRun, onSelect],
  );

  const openRun = useCallback(
    async (runId: string) => {
      const request = ++generation.current;
      try {
        const run = await fetchRun(runId);
        if (request !== generation.current) return;
        await selectRun(run);
        await loadRuns();
      } catch {
        if (request !== generation.current) return;
        setOpenError(`Failed to open run ${runId}`);
        setEvalError(`Failed to open run ${runId}`);
      }
    },
    [loadRuns, selectRun, setEvalError],
  );

  useEffect(() => {
    const runId = new URL(window.location.href).searchParams.get("run");
    if (runId) void openRun(runId);
    return () => {
      generation.current++;
    };
  }, [openRun]);

  return { selectRun, openRun, openError, clearRunUrl };
}
