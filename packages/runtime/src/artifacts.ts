import { createHash } from "node:crypto";
import type {
  ArtifactFile,
  ArtifactSnapshot,
  ArtifactSnapshotDetail,
  ArtifactVersion,
  ArtifactWorkspace,
  PlicoEvent,
} from "./types/index.js";

function applyFileWritten(
  files: Map<string, ArtifactFile>,
  versions: ArtifactVersion[],
  event: PlicoEvent<"artifact.file.written">,
): ArtifactFile {
  const path = event.payload.path;
  const version = event.payload.version ?? (files.get(path)?.version ?? 0) + 1;
  const contentHash =
    event.payload.contentHash ??
    createHash("sha256").update(event.payload.content, "utf8").digest("hex");
  const file = {
    path,
    content: event.payload.content,
    mimeType: event.payload.mimeType,
    version,
    contentHash,
  };
  files.set(path, file);
  versions.push({
    path,
    mimeType: file.mimeType,
    version,
    contentHash,
    createdAt: event.timestamp,
  });
  return file;
}

/** Returns a historical file version using the same replay rules as the workspace projection. */
export function readArtifactVersion(
  events: PlicoEvent[],
  path: string,
  targetVersion: number,
): ArtifactFile | undefined {
  const files = new Map<string, ArtifactFile>();
  const versions: ArtifactVersion[] = [];
  for (const event of events) {
    if (event.type !== "artifact.file.written") continue;
    const file = applyFileWritten(files, versions, event);
    if (file.path === path && file.version === targetVersion) return file;
  }
  return undefined;
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
  const versions: ArtifactVersion[] = [];
  const snapshots: ArtifactSnapshot[] = [];
  for (const event of events) {
    if (event.type === "artifact.file.written") applyFileWritten(files, versions, event);
    if (event.type === "artifact.snapshot.created") snapshots.push(toSnapshot(event));
  }

  return {
    workspaceId: created.payload.workspaceId,
    runId: created.runId,
    files: [...files.values()],
    versions,
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
