import type { ArtifactFileMetadata } from "@plico-ai/contracts";
import mime from "mime";
import picomatch from "picomatch";
import { validateArtifactPath } from "../run/artifact-tool-context.js";
import type { ToolArtifactContext, ToolArtifactFile } from "../types/index.js";

const defaultListLimit = 100;
const defaultReadLimit = 200;
const maxReadBytes = 32 * 1024;
type ListedArtifact = Pick<ArtifactFileMetadata, "path" | "sizeBytes" | "mimeType" | "version">;

export async function listFiles(
  input: unknown,
  artifacts: ToolArtifactContext,
): Promise<{ files: ListedArtifact[]; offset: number; nextOffset?: number }> {
  const value = input as { glob?: string; offset?: number; limit?: number };
  const offset = value.offset ?? 0;
  const limit = value.limit ?? defaultListLimit;
  let matches = await artifacts.list();
  if (value.glob !== undefined) {
    let match: (path: string) => boolean;
    try {
      match = picomatch(value.glob, { strictBrackets: true, maxLength: 1024, dot: true });
    } catch (error) {
      throw new Error(
        `Invalid file glob: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    matches = matches.filter((file) => match(file.path));
  }
  matches.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const files = matches
    .slice(offset, offset + limit)
    .map(({ path, sizeBytes, mimeType, version }) => ({
      path,
      sizeBytes,
      mimeType,
      version,
    }));
  const nextOffset = offset + files.length;
  return {
    files,
    offset,
    ...(nextOffset < matches.length ? { nextOffset } : {}),
  };
}

export async function readFile(
  input: unknown,
  artifacts: ToolArtifactContext,
): Promise<
  | {
      path: string;
      content: string;
      mimeType: string;
      version: number;
      offset: number;
      nextOffset?: number;
    }
  | ({ path: string; binary: true } & ArtifactFileMetadata)
> {
  const value = input as { path: string; offset?: number; limit?: number };
  validateArtifactPath(value.path);
  const file = await artifacts.read(value.path);
  if (!file) throw new Error(`Artifact not found: ${value.path}`);
  if (file.content instanceof Uint8Array)
    return { ...metadata(file), path: file.path, binary: true };

  const lines = file.content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const offset = value.offset ?? 1;
  const limit = value.limit ?? defaultReadLimit;
  const start = offset - 1;
  const page: string[] = [];
  let pageBytes = 0;
  for (let index = start; index < Math.min(lines.length, start + limit); index++) {
    const line = lines[index] ?? "";
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (pageBytes + lineBytes > maxReadBytes) {
      if (page.length === 0)
        throw new Error(`Line ${index + 1} of ${value.path} exceeds the 32 KiB read limit.`);
      break;
    }
    page.push(line);
    pageBytes += lineBytes;
  }
  const nextOffset = start + page.length + 1;
  return {
    path: file.path,
    content: page.join(""),
    mimeType: file.mimeType,
    version: file.version,
    offset,
    ...(nextOffset <= lines.length ? { nextOffset } : {}),
  };
}

export async function writeFile(
  input: unknown,
  artifacts: ToolArtifactContext,
): Promise<{ path: string; version: number }> {
  const value = input as { path: string; content: string; mimeType?: string };
  const mimeType = value.mimeType ?? mime.getType(value.path) ?? "text/plain";
  return artifacts.write(value.path, value.content, { mimeType });
}

export async function editFile(
  input: unknown,
  artifacts: ToolArtifactContext,
): Promise<{ path: string; version: number; replacementCount: number }> {
  const value = input as { path: string; old: string; new: string; replaceAll?: boolean };
  if (value.old === value.new)
    throw new Error("The old and new text are identical; no edit was made.");
  validateArtifactPath(value.path);
  const file = await artifacts.read(value.path);
  if (!file) throw new Error(`Artifact not found: ${value.path}`);
  if (file.content instanceof Uint8Array)
    throw new Error(`Cannot edit binary artifact ${value.path}; edit_file accepts text only.`);

  const occurrences = countMatches(file.content, value.old);
  if (occurrences === 0) throw new Error(`Text to replace was not found in ${value.path}.`);
  if (occurrences > 1 && value.replaceAll !== true)
    throw new Error(
      `Text to replace occurs ${occurrences} times in ${value.path}; set replaceAll to true.`,
    );

  const content = value.replaceAll
    ? file.content.replaceAll(value.old, () => value.new)
    : replaceFirst(file.content, value.old, value.new);
  const write = await artifacts.write(value.path, content, { mimeType: file.mimeType });
  return { ...write, replacementCount: value.replaceAll ? occurrences : 1 };
}

function metadata(file: ToolArtifactFile): ArtifactFileMetadata {
  return {
    path: file.path,
    sizeBytes:
      file.content instanceof Uint8Array
        ? file.content.byteLength
        : Buffer.byteLength(file.content, "utf8"),
    mimeType: file.mimeType,
    version: file.version,
    contentHash: file.contentHash,
  };
}

function countMatches(content: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(search, offset);
    if (index < 0) return count;
    count++;
    offset = index + search.length;
  }
}

function replaceFirst(content: string, search: string, replacement: string): string {
  const index = content.indexOf(search);
  return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
}
