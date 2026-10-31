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
import type { ArtifactFile, ArtifactWorkspace, RunSummary } from "../types";

interface ArtifactsViewProps {
  selectedRun: RunSummary | null;
  workspace: ArtifactWorkspace | null;
  previewFile: ArtifactFile | null;
  onPreviewFile: (file: ArtifactFile | null) => void;
}

export function ArtifactsView({
  selectedRun,
  workspace,
  previewFile,
  onPreviewFile,
}: ArtifactsViewProps) {
  if (!selectedRun) {
    return <div style={emptyPanel}>Select a run to view artifacts.</div>;
  }

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
        <div style={meta}>{previewFile.mimeType}</div>
        <FilePreview file={previewFile} />
      </div>
    );
  }

  return (
    <div style={panel}>
      <h3 style={headingTight}>Artifact Workspace: {workspace.workspaceId}</h3>
      <div style={metaLoose}>
        {workspace.files.length} file(s) &middot; {workspace.snapshots.length} snapshot(s)
      </div>
      {workspace.files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => onPreviewFile(file)}
          style={{ ...listItemButton, background: "#fafafa", border: "1px solid #eee" }}
        >
          {file.path}
          <span style={{ color: "#999", marginLeft: "8px" }}>{file.mimeType}</span>
        </button>
      ))}
    </div>
  );
}
