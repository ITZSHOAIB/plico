export type ArtifactContent = string | { encoding: "base64"; data: string };

export interface ArtifactFileMetadata {
  path: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  contentHash: string;
}

export interface ArtifactFile {
  path: string;
  content: ArtifactContent;
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
  runId: string;
  createdAt: string;
}

export interface ArtifactDiff {
  path: string;
  fromVersion: number;
  toVersion: number;
  diff: string;
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
  threadId?: string;
  files: ArtifactFile[];
  versions: ArtifactVersion[];
  snapshots: ArtifactSnapshot[];
  createdAt: string;
}

export interface ThreadArtifactWorkspace {
  workspaceId: string;
  threadId: string;
  files: ArtifactFile[];
  versions: ArtifactVersion[];
  snapshots: ArtifactSnapshot[];
  createdAt: string;
}
