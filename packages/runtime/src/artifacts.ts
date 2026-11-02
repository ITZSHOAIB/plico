import type {
  ArtifactFile,
  ArtifactSnapshot,
  ArtifactSnapshotDetail,
  ArtifactWorkspace,
  PlicoEvent,
} from "./types/index.js";

function applyFileWritten(
  files: Map<string, ArtifactFile>,
  event: PlicoEvent<"artifact.file.written">,
): void {
  const path = event.payload.path;
  files.set(path, {
    path,
    content: event.payload.content,
    mimeType: event.payload.mimeType,
    version: (files.get(path)?.version ?? 0) + 1,
  });
}

function toSnapshot(event: PlicoEvent<"artifact.snapshot.created">): ArtifactSnapshot {
  return {
    snapshotId: event.payload.snapshotId,
    fileCount: event.payload.fileCount,
    createdAt: event.timestamp,
  };
}

export function buildArtifactWorkspace(
  _runId: string,
  events: PlicoEvent[],
): ArtifactWorkspace | undefined {
  const created = events.find((event) => event.type === "artifact.workspace.created");
  if (!created) return undefined;

  const files = new Map<string, ArtifactFile>();
  const snapshots: ArtifactSnapshot[] = [];
  for (const event of events) {
    if (event.type === "artifact.file.written") applyFileWritten(files, event);
    if (event.type === "artifact.snapshot.created") snapshots.push(toSnapshot(event));
  }

  return {
    workspaceId: created.payload.workspaceId,
    runId: created.runId,
    files: [...files.values()],
    snapshots,
    createdAt: created.timestamp,
  };
}

export function readArtifactSnapshot(
  events: PlicoEvent[],
  snapshotId: string,
): ArtifactSnapshotDetail | undefined {
  const index = events.findIndex(
    (event) =>
      event.type === "artifact.snapshot.created" && event.payload.snapshotId === snapshotId,
  );
  const snapshot = events[index];
  // This narrows the event for TypeScript and also returns early when the snapshot is missing.
  if (snapshot?.type !== "artifact.snapshot.created") return undefined;

  const workspace = buildArtifactWorkspace(snapshot.runId, events.slice(0, index + 1));
  return { ...toSnapshot(snapshot), files: workspace?.files ?? [] };
}
