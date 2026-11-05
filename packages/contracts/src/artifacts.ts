export interface ArtifactFile {
  path: string;
  content: string;
  mimeType: string;
  /** Starts at 1 and increments each time the path is rewritten. */
  version: number;
  contentHash: string;
}

export interface ArtifactVersion {
  path: string;
  mimeType: string;
  version: number;
  contentHash: string;
  createdAt: string;
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
  versions: ArtifactVersion[];
  snapshots: ArtifactSnapshot[];
  createdAt: string;
}
