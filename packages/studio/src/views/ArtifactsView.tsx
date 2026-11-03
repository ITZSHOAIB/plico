import { useRef, useState } from "react";
import { fetchArtifactSnapshot } from "../api";
import { FilePreview } from "../components/FilePreview";
import {
  backButton,
  emptyPanel,
  headingTight,
  listItemButton,
  meta,
  metaLoose,
  panel,
} from "../styles";
import type { ArtifactFile, ArtifactSnapshotDetail, ArtifactWorkspace, RunSummary } from "../types";

const currentWorkspaceNotice =
  "Showing the current workspace, not the workspace at the selected event";

interface ArtifactsViewProps {
  selectedRun: RunSummary | null;
  workspace: ArtifactWorkspace | null;
  workspaceError: string | null;
  workspaceLoading: boolean;
  previewFile: ArtifactFile | null;
  onPreviewFile: (file: ArtifactFile | null) => void;
}

export function ArtifactsView({
  selectedRun,
  workspace,
  workspaceError,
  workspaceLoading,
  previewFile,
  onPreviewFile,
}: ArtifactsViewProps) {
  const [snapshot, setSnapshot] = useState<ArtifactSnapshotDetail | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const snapshotRequest = useRef(0);
  if (!selectedRun) {
    return <div style={emptyPanel}>Select a run to view artifacts.</div>;
  }

  if (workspaceError)
    return (
      <div role="alert" style={emptyPanel}>
        {workspaceError}
      </div>
    );
  if (workspaceLoading) return <div style={emptyPanel}>Loading artifact workspace…</div>;
  if (!workspace) {
    return <div style={emptyPanel}>No artifact workspace for this run.</div>;
  }

  if (previewFile) {
    return (
      <div style={panel}>
        <button type="button" onClick={() => onPreviewFile(null)} style={backButton}>
          ← Back to files
        </button>
        <h3 style={headingTight}>{previewFile.path}</h3>
        <div style={meta}>
          {snapshot ? `Snapshot: ${snapshot.snapshotId}` : currentWorkspaceNotice}
        </div>
        <div style={meta}>
          {previewFile.mimeType} &middot; v{previewFile.version}
        </div>
        <FilePreview file={previewFile} />
      </div>
    );
  }

  if (snapshot) {
    return (
      <div style={panel}>
        <button
          type="button"
          style={backButton}
          onClick={() => {
            snapshotRequest.current++;
            setSnapshot(null);
          }}
        >
          ← Back to workspace
        </button>
        <h3 style={headingTight}>Snapshot: {snapshot.snapshotId}</h3>
        {snapshot.files.map((file) => (
          <button
            key={file.path}
            type="button"
            style={listItemButton}
            onClick={() => onPreviewFile(file)}
          >
            {file.path}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={panel}>
      <h3 style={headingTight}>Artifact Workspace: {workspace.workspaceId}</h3>
      <div style={meta}>{currentWorkspaceNotice}</div>
      {snapshotError && <div role="alert">{snapshotError}</div>}
      <div style={metaLoose}>
        {workspace.files.length} file(s) &middot; {workspace.snapshots.length} snapshot(s)
      </div>
      {workspace.files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => {
            snapshotRequest.current++;
            onPreviewFile(file);
          }}
          style={{ ...listItemButton, background: "#fafafa", border: "1px solid #eee" }}
        >
          {file.path}
          <span style={{ color: "#999", marginLeft: "8px" }}>
            {file.mimeType} v{file.version}
          </span>
        </button>
      ))}
      {workspace.snapshots.map((snapshot) => (
        <button
          key={snapshot.snapshotId}
          type="button"
          style={listItemButton}
          onClick={() => {
            const request = ++snapshotRequest.current;
            setSnapshotError(null);
            void fetchArtifactSnapshot(selectedRun.runId, snapshot.snapshotId)
              .then((result) => {
                if (request === snapshotRequest.current) setSnapshot(result);
              })
              .catch(() => {
                if (request === snapshotRequest.current)
                  setSnapshotError("Could not load snapshot");
              });
          }}
        >
          {snapshot.snapshotId} &middot; {snapshot.fileCount} file(s) &middot; {snapshot.createdAt}
        </button>
      ))}
    </div>
  );
}
