import type { ArtifactWorkspace, PlicoEvent } from "./types.js";

export function buildArtifactWorkspace(
  _runId: string,
  events: PlicoEvent[],
): ArtifactWorkspace | undefined {
  let workspace: ArtifactWorkspace | undefined;

  for (const event of events) {
    if (event.type === "artifact.workspace.created") {
      workspace = {
        workspaceId: event.payload.workspaceId as string,
        runId: event.runId,
        files: [],
        snapshots: [],
        createdAt: event.timestamp,
      };
    } else if (event.type === "artifact.file.written" && workspace) {
      workspace.files.push({
        path: event.payload.path as string,
        content: event.payload.content as string,
        mimeType: (event.payload.mimeType as string) ?? "text/plain",
      });
    } else if (event.type === "artifact.snapshot.created" && workspace) {
      workspace.snapshots.push({
        snapshotId: event.payload.snapshotId as string,
        fileCount: event.payload.fileCount as number,
        createdAt: event.timestamp,
      });
    }
  }

  return workspace;
}
