import type {
  ArtifactContent,
  ArtifactFile,
  ArtifactFileMetadata,
  PlicoEvent,
  PlicoEventPayloads,
} from "@plico/contracts";
import {
  artifactFileMetadata,
  buildArtifactWorkspace,
  decodeArtifactContent,
  encodeArtifactContent,
  hashArtifactContent,
} from "../artifacts.js";
import type { ToolArtifactContext, ToolArtifactFile } from "../types/index.js";

const maxArtifactContentBytes = 1024 * 1024;
const maxArtifactPathLength = 1024;

export interface StagedArtifactWrite {
  path: string;
  content: ArtifactContent;
  mimeType: string;
  contentHash: string;
  version: number;
}

interface StagedArtifactContext {
  context: ToolArtifactContext;
  writes(): StagedArtifactWrite[];
  workspaceCreated(): boolean;
  workspaceId: string;
}

export function createStagedArtifactContext(
  runId: string,
  threadId: string | undefined,
  history: PlicoEvent[],
): StagedArtifactContext {
  const workspaceId = threadId ? `${threadId}:workspace` : `${runId}:workspace`;
  const initialWorkspace = buildArtifactWorkspace(workspaceId, history);
  const files = new Map<string, ArtifactFile>(
    (initialWorkspace?.files ?? []).map((file) => [file.path, file]),
  );
  const writesList: StagedArtifactWrite[] = [];

  const context: ToolArtifactContext = {
    async read(path): Promise<ToolArtifactFile | undefined> {
      const file = files.get(path);
      if (!file) return undefined;
      return { ...file, content: decodeArtifactContent(file.content) };
    },
    async write(path, content, options): Promise<{ path: string; version: number }> {
      validateArtifactWrite(path, content);
      const encoded = encodeArtifactContent(content);
      const file: ArtifactFile = {
        path,
        content: encoded,
        mimeType:
          options?.mimeType ??
          (typeof content === "string" ? "text/plain" : "application/octet-stream"),
        version: (files.get(path)?.version ?? 0) + 1,
        contentHash: hashArtifactContent(encoded),
      };
      files.set(path, file);
      writesList.push({
        path: file.path,
        content: file.content,
        mimeType: file.mimeType,
        contentHash: file.contentHash,
        version: file.version,
      });
      return { path, version: file.version };
    },
    async list(): Promise<ArtifactFileMetadata[]> {
      return [...files.values()].map(artifactFileMetadata);
    },
  };

  return {
    context,
    writes: () => [...writesList],
    workspaceCreated: () => initialWorkspace === undefined && writesList.length > 0,
    workspaceId,
  };
}

function validateArtifactWrite(path: string, content: string | Uint8Array): void {
  const segments = path.split(/[\\/]/);
  if (
    path.length === 0 ||
    path.length > maxArtifactPathLength ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-zA-Z]:/.test(path) ||
    segments.some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error(
      `Invalid artifact path: expected a non-empty relative path without '..' and at most ${maxArtifactPathLength} characters.`,
    );
  }
  const sizeBytes =
    typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
  if (sizeBytes > maxArtifactContentBytes)
    throw new Error("Artifact content exceeds the 1 MiB write limit.");
}

export function artifactWriteEventPayload(
  write: StagedArtifactWrite,
): PlicoEventPayloads["artifact.file.written"] {
  const content: ArtifactContent = write.content;
  return {
    path: write.path,
    content,
    mimeType: write.mimeType,
    contentHash: write.contentHash,
    version: write.version,
  };
}
