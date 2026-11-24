import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchInstructions,
  fetchProject,
  fetchReadiness,
  fetchRuns,
  fetchSchemas,
  fetchTools,
} from "../api";
import type {
  AgentSchemas,
  ComposedInstructions,
  LoadedProject,
  ReadinessReport,
  RunSummary,
  ToolsReport,
} from "../types";

export function useProjectData() {
  const latestRunRequest = useRef(0);
  const latestReadinessRequest = useRef(0);
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [instructions, setInstructions] = useState<ComposedInstructions | null>(null);
  const [schemas, setSchemas] = useState<AgentSchemas>({});
  const [tools, setTools] = useState<ToolsReport | null>(null);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const request = ++latestRunRequest.current;
    await fetchRuns()
      .then((runs) => {
        if (request === latestRunRequest.current) {
          setRuns(runs);
          setRunsError(null);
        }
      })
      .catch(() => {
        if (request === latestRunRequest.current) setRunsError("Could not load runs");
      });
  }, []);

  const loadReadiness = useCallback(async () => {
    const request = ++latestReadinessRequest.current;
    try {
      const report = await fetchReadiness();
      if (request !== latestReadinessRequest.current) return;
      setReadiness(report);
      setReadinessError(null);
    } catch {
      if (request === latestReadinessRequest.current) setReadinessError("Could not load readiness");
    }
  }, []);

  useEffect(() => {
    fetchProject()
      .then(setProject)
      .catch(() => setError("Failed to load project"));
    fetchInstructions()
      .then(setInstructions)
      .catch(() => setInstructionsError("Could not load instructions"));
    // Schemas are optional detail on the Instructions view, so a failure only hides them.
    fetchSchemas()
      .then(setSchemas)
      .catch(() => setSchemas({}));
    fetchTools()
      .then((report) => {
        setTools(report);
        setToolsError(null);
      })
      .catch(() => setToolsError("Could not load tools"));
    void loadRuns();
    void loadReadiness();
    const refresh = setInterval(() => {
      if (!document.hidden) void loadRuns();
    }, 2_000);
    return () => {
      clearInterval(refresh);
      latestRunRequest.current++;
      latestReadinessRequest.current++;
    };
  }, [loadRuns, loadReadiness]);

  return {
    project,
    runs,
    runsError,
    instructions,
    instructionsError,
    schemas,
    tools,
    toolsError,
    readiness,
    readinessError,
    error,
    loadRuns,
    loadReadiness,
  };
}

export type ProjectData = ReturnType<typeof useProjectData>;
