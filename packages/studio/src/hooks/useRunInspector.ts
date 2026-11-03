import { useCallback, useRef, useState } from "react";
import { fetchArtifactWorkspace, fetchEvents } from "../api";
import type { ArtifactFile, ArtifactWorkspace, PlicoEvent, RunSummary } from "../types";
import { type StreamTarget, useRunStream } from "./useRunStream";

export function useRunInspector() {
  const selection = useRef(0);
  const selectedId = useRef<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [target, setTarget] = useState<StreamTarget | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const [events, setEvents] = useState<PlicoEvent[]>([]);
  const [workspace, setWorkspace] = useState<ArtifactWorkspace | null>(null);
  const [previewFile, setPreviewFile] = useState<ArtifactFile | null>(null);

  const onEvent = useCallback((event: PlicoEvent) => {
    if (selectedId.current !== event.runId) return;
    setEvents((current) =>
      current.some((item) => item.sequence === event.sequence) ? current : [...current, event],
    );
    setSelectedRun((current) => {
      if (!current || current.runId !== event.runId) return current;
      const status =
        event.type === "run.completed"
          ? "completed"
          : event.type === "run.failed"
            ? "failed"
            : event.type === "run.cancelled"
              ? "cancelled"
              : event.type === "run.waiting"
                ? "waiting"
                : current.status === "waiting"
                  ? "running"
                  : current.status;
      return {
        ...current,
        status,
        endedAt: ["completed", "failed", "cancelled"].includes(status) ? event.timestamp : null,
      };
    });
  }, []);
  const streamState = useRunStream(target, onEvent);
  const selectRun = useCallback(
    async (run: RunSummary) => {
      const generation = ++selection.current;
      selectedId.current = run.runId;
      setTarget(null);
      setEventsError(null);
      setEvents([]);
      setSelectedRun(run);
      setPreviewFile(null);
      try {
        const history = await fetchEvents(run.runId);
        if (selection.current !== generation) return;
        setEvents(history);
        const last = history.at(-1);
        if (last && ["run.completed", "run.failed", "run.cancelled"].includes(last.type)) {
          onEvent(last);
          return;
        }
        if (last?.type === "run.waiting") onEvent(last);
        if (!["completed", "failed", "cancelled"].includes(run.status)) {
          setTarget({ runId: run.runId, after: history.at(-1)?.sequence ?? 0 });
        }
      } catch {
        if (selection.current === generation) {
          setEvents([]);
          setEventsError("Could not load run events. The history may be incomplete.");
        }
      }
    },
    [onEvent],
  );

  const loadWorkspace = useCallback(async (runId: string) => {
    setPreviewFile(null);
    try {
      setWorkspace(await fetchArtifactWorkspace(runId));
    } catch {
      setWorkspace(null);
    }
  }, []);

  const clear = useCallback(() => {
    selection.current++;
    selectedId.current = null;
    setTarget(null);
    setSelectedRun(null);
    setPreviewFile(null);
  }, []);

  return {
    selectedRun,
    events,
    streamState,
    eventsError,
    workspace,
    previewFile,
    selectRun,
    loadWorkspace,
    setPreviewFile,
    clear,
  };
}

export type RunInspector = ReturnType<typeof useRunInspector>;
