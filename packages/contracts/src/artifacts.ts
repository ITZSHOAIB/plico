export interface ArtifactFile {
  path: string;
  content: string;
  mimeType: string;
  /** Starts at 1 and increments each time the path is rewritten. */
  version: number;
}

export interface ArtifactSnapshot {
  snapshotId: string;
  fileCount: number;
  createdAt: string;
}

export interface ArtifactSnapshotDetail extends ArtifactSnapshot {
  files: ArtifactFile[];
}

export interface ArtifactWorkspace {
  workspaceId: string;
  runId: string;
  files: ArtifactFile[];
  snapshots: ArtifactSnapshot[];
  createdAt: string;
}
