import { useRef, useState } from "react";
import { artifactExportUrl, fetchArtifactSnapshot } from "../api";
import { ArtifactVersionReview } from "../components/ArtifactVersionReview";
import { FilePreview } from "../components/FilePreview";
import type { ArtifactFile, ArtifactSnapshotDetail, ArtifactWorkspace, RunSummary } from "../types";
import { Icon } from "../ui/Icon";
import { EmptyState, listRowClass, Notice, Page } from "../ui/Page";

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

function FileRow({ file, onOpen }: { file: ArtifactFile; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className={listRowClass}>
        <span className="text-muted">
          <Icon name="file" />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-small">{file.path}</span>
        {"mimeType" in file && (
          <span className="shrink-0 text-caption text-faint">
            {file.mimeType} v{file.version}
          </span>
        )}
      </button>
    </li>
  );
}

const listClass =
  "m-0 mb-4 list-none overflow-hidden rounded-panel border border-line bg-surface p-0";

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
    return <EmptyState>Select a run to view artifacts.</EmptyState>;
  }

  if (workspaceError) return <EmptyState alert>{workspaceError}</EmptyState>;
  if (workspaceLoading) return <EmptyState>Loading artifact workspace…</EmptyState>;
  if (!workspace) {
    return <EmptyState>No artifact workspace for this run.</EmptyState>;
  }

  if (previewFile) {
    return (
      <Page
        title={previewFile.path}
        actions={
          snapshot ? undefined : (
            <a
              href={artifactExportUrl(selectedRun.runId, previewFile.path)}
              download
              aria-label={`Download ${previewFile.path}`}
              className="inline-flex min-h-9 items-center rounded-control border border-line bg-raised px-3 text-small font-medium text-fg hover:border-faint focus-visible:outline-2 focus-visible:outline-accent"
            >
              Download
            </a>
          )
        }
        subtitle={
          <>
            <div>{snapshot ? `Snapshot: ${snapshot.snapshotId}` : currentWorkspaceNotice}</div>
            <div>
              {previewFile.mimeType} &middot; v{previewFile.version}
            </div>
          </>
        }
        onBack={() => onPreviewFile(null)}
        backLabel="Back to files"
      >
        <FilePreview file={previewFile} />
        <ArtifactVersionReview
          key={`${selectedRun.runId}:${previewFile.path}`}
          runId={selectedRun.runId}
          path={previewFile.path}
          versions={workspace.versions}
        />
      </Page>
    );
  }

  if (snapshot) {
    return (
      <Page
        title={`Snapshot: ${snapshot.snapshotId}`}
        onBack={() => {
          snapshotRequest.current++;
          setSnapshot(null);
        }}
        backLabel="Back to workspace"
      >
        <ul className={listClass}>
          {snapshot.files.map((file) => (
            <FileRow key={file.path} file={file} onOpen={() => onPreviewFile(file)} />
          ))}
        </ul>
      </Page>
    );
  }

  return (
    <Page
      title={`Artifact Workspace: ${workspace.workspaceId}`}
      subtitle={
        <>
          <div>{currentWorkspaceNotice}</div>
          <div>
            {workspace.files.length} file(s) &middot; {workspace.snapshots.length} snapshot(s)
          </div>
        </>
      }
    >
      {snapshotError && <Notice>{snapshotError}</Notice>}
      <ul className={listClass}>
        {workspace.files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            onOpen={() => {
              snapshotRequest.current++;
              onPreviewFile(file);
            }}
          />
        ))}
      </ul>
      <ul className={listClass}>
        {workspace.snapshots.map((item) => (
          <li key={item.snapshotId}>
            <button
              type="button"
              className={listRowClass}
              onClick={() => {
                const request = ++snapshotRequest.current;
                setSnapshotError(null);
                void fetchArtifactSnapshot(selectedRun.runId, item.snapshotId)
                  .then((result) => {
                    if (request === snapshotRequest.current) setSnapshot(result);
                  })
                  .catch(() => {
                    if (request === snapshotRequest.current)
                      setSnapshotError("Could not load snapshot");
                  });
              }}
            >
              <span className="text-muted">
                <Icon name="snapshot" />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-small">
                {item.snapshotId} &middot; {item.fileCount} file(s) &middot; {item.createdAt}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
