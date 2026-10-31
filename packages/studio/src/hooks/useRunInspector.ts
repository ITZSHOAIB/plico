import { useCallback, useState } from "react";
import { fetchArtifactWorkspace, fetchEvents } from "../api";
import type { ArtifactFile, ArtifactWorkspace, PlicoEvent, RunSummary } from "../types";

export function useRunInspector() {
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const [events, setEvents] = useState<PlicoEvent[]>([]);
  const [workspace, setWorkspace] = useState<ArtifactWorkspace | null>(null);
  const [previewFile, setPreviewFile] = useState<ArtifactFile | null>(null);

  const selectRun = useCallback(async (run: RunSummary) => {
    setSelectedRun(run);
    setPreviewFile(null);
    try {
      setEvents(await fetchEvents(run.runId));
    } catch {
      setEvents([]);
    }
  }, []);

  const loadWorkspace = useCallback(async (runId: string) => {
    setPreviewFile(null);
    try {
      setWorkspace(await fetchArtifactWorkspace(runId));
    } catch {
      setWorkspace(null);
    }
  }, []);

  const clear = useCallback(() => {
    setSelectedRun(null);
    setPreviewFile(null);
  }, []);

  return {
    selectedRun,
    events,
    workspace,
    previewFile,
    selectRun,
    loadWorkspace,
    setPreviewFile,
    clear,
  };
}

export type RunInspector = ReturnType<typeof useRunInspector>;
