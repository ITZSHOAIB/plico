export interface ArtifactFile {
  path: string;
  content: string;
  mimeType: string;
}

export interface ArtifactSnapshot {
  snapshotId: string;
  fileCount: number;
  createdAt: string;
}

export interface ArtifactWorkspace {
  workspaceId: string;
  runId: string;
  files: ArtifactFile[];
  snapshots: ArtifactSnapshot[];
  createdAt: string;
}
