import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildArtifactWorkspace, readArtifactSnapshot, runProject } from "./index.js";

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-artifacts-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  return root;
}

async function runTwoWrites() {
  const root = await scaffold();
  const result = await runProject(root, {
    script: [
      { type: "artifact.write", files: [{ path: "a.md", content: "one" }] },
      {
        type: "artifact.write",
        files: [
          { path: "a.md", content: "two" },
          { path: "b.md", content: "bee" },
        ],
      },
    ],
  });
  return result;
}

describe("artifact workspace", () => {
  it("keeps one workspace per run and the latest version of each path", async () => {
    const result = await runTwoWrites();

    const workspace = buildArtifactWorkspace(result.runId, result.events);

    expect(result.events.filter((e) => e.type === "artifact.workspace.created")).toHaveLength(1);
    expect(workspace?.files).toEqual([
      { path: "a.md", content: "two", mimeType: "text/plain", version: 2 },
      { path: "b.md", content: "bee", mimeType: "text/plain", version: 1 },
    ]);
    expect(workspace?.snapshots.map((s) => s.fileCount)).toEqual([1, 2]);
  });

  it("reads the files as they were when a snapshot was taken", async () => {
    const result = await runTwoWrites();
    const workspace = buildArtifactWorkspace(result.runId, result.events);
    const first = workspace?.snapshots[0]?.snapshotId ?? "";

    const snapshot = readArtifactSnapshot(result.events, first);

    expect(snapshot?.files).toEqual([
      { path: "a.md", content: "one", mimeType: "text/plain", version: 1 },
    ]);
    expect(readArtifactSnapshot(result.events, "missing")).toBeUndefined();
  });
});
