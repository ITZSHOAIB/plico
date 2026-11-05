import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  buildArtifactWorkspace,
  createSqliteEventStore,
  readArtifactSnapshot,
  runProject,
} from "./index.js";

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
    expect(workspace?.files).toMatchObject([
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

    expect(snapshot?.files).toMatchObject([
      { path: "a.md", content: "one", mimeType: "text/plain", version: 1 },
    ]);
    expect(readArtifactSnapshot(result.events, "missing")).toBeUndefined();
  });

  it("persists content-addressed versions and replays their ordered history", async () => {
    const root = await scaffold();
    const databasePath = join(root, "events.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const result = await runProject(root, {
      eventStore: store,
      script: [
        { type: "artifact.write", files: [{ path: "a.md", content: "same" }] },
        { type: "artifact.write", files: [{ path: "a.md", content: "same" }] },
        { type: "artifact.write", files: [{ path: "a.md", content: "new" }] },
      ],
    });

    const replayedEvents = await store.getEvents(result.runId);
    const reopenedStore = createSqliteEventStore({ databasePath });
    const reopenedEvents = await reopenedStore.getEvents(result.runId);
    const workspace = buildArtifactWorkspace(result.runId, reopenedEvents);
    const database = new DatabaseSync(databasePath);
    const storedContents = database
      .prepare("SELECT content FROM artifact_content ORDER BY content_hash")
      .all();
    const artifactReceipts = database
      .prepare("SELECT payload_json FROM events WHERE type = 'artifact.file.written'")
      .all() as Array<{ payload_json: string }>;

    expect(workspace?.files[0]).toMatchObject({ content: "new", version: 3 });
    expect(workspace?.versions).toMatchObject([
      { path: "a.md", version: 1 },
      { path: "a.md", version: 2 },
      { path: "a.md", version: 3 },
    ]);
    expect(workspace?.versions[0]?.contentHash).toBe(workspace?.versions[1]?.contentHash);
    expect(workspace?.versions[1]?.contentHash).not.toBe(workspace?.versions[2]?.contentHash);
    expect(storedContents).toHaveLength(2);
    expect(
      artifactReceipts.every(
        ({ payload_json }) => !Object.hasOwn(JSON.parse(payload_json), "content"),
      ),
    ).toBe(true);
    expect(replayedEvents.filter((event) => event.type === "artifact.file.written")).toHaveLength(
      3,
    );
    database.close();
  });
});
