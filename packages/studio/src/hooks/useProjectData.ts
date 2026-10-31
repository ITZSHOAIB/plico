import { useCallback, useEffect, useState } from "react";
import { fetchInstructions, fetchProject, fetchReadiness, fetchRuns } from "../api";
import type { ComposedInstructions, LoadedProject, ReadinessReport, RunSummary } from "../types";

export function useProjectData() {
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [instructions, setInstructions] = useState<ComposedInstructions | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    await fetchRuns()
      .then(setRuns)
      .catch(() => {});
  }, []);

  const loadReadiness = useCallback(async () => {
    await fetchReadiness()
      .then(setReadiness)
      .catch(() => setReadiness(null));
  }, []);

  useEffect(() => {
    fetchProject()
      .then(setProject)
      .catch(() => setError("Failed to load project"));
    fetchInstructions()
      .then(setInstructions)
      .catch(() => {});
    void loadRuns();
    void loadReadiness();
  }, [loadRuns, loadReadiness]);

  return { project, runs, instructions, readiness, error, loadRuns, loadReadiness };
}

export type ProjectData = ReturnType<typeof useProjectData>;
