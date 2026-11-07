import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  buildArtifactWorkspace,
  createSqliteEventStore,
  readArtifactSnapshot,
  readArtifactVersion,
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
    expect(workspace?.files).toEqual([
      {
        path: "a.md",
        content: "two",
        mimeType: "text/plain",
        version: 2,
        contentHash: "3fc4ccfe745870e2c0d99f71f30ff0656c8dedd41cc1d7d3d376b0dbe685e2f3",
      },
      {
        path: "b.md",
        content: "bee",
        mimeType: "text/plain",
        version: 1,
        contentHash: "62cb81b5904a262ffaeed02abef36bfc540b09f964b8b0b636662f77ffce6714",
      },
    ]);
    expect(workspace?.snapshots.map((s) => s.fileCount)).toEqual([1, 2]);
  });

  it("reads the files as they were when a snapshot was taken", async () => {
    const result = await runTwoWrites();
    const workspace = buildArtifactWorkspace(result.runId, result.events);
    const first = workspace?.snapshots[0]?.snapshotId ?? "";

    const snapshot = readArtifactSnapshot(result.events, first);

    expect(snapshot?.files).toEqual([
      {
        path: "a.md",
        content: "one",
        mimeType: "text/plain",
        version: 1,
        contentHash: "7692c3ad3540bb803c020b3aee66cd8887123234ea0c6e7143c0add73ff431ed",
      },
    ]);
    expect(readArtifactSnapshot(result.events, "missing")).toBeUndefined();
  });

  it("uses workspace version rules when a write receipt omits its version", async () => {
    const result = await runTwoWrites();
    const mixedEvents = result.events.map((event) => {
      if (
        event.type !== "artifact.file.written" ||
        event.payload.path !== "a.md" ||
        event.payload.version !== 1
      ) {
        return event;
      }
      const { version: _version, ...payload } = event.payload;
      return { ...event, payload };
    });

    const workspace = buildArtifactWorkspace(result.runId, mixedEvents);

    expect(
      workspace?.versions.filter((version) => version.path === "a.md").map((v) => v.version),
    ).toEqual([1, 2]);
    expect(readArtifactVersion(mixedEvents, "a.md", 2)).toMatchObject({
      path: "a.md",
      content: "two",
      version: 2,
    });
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

  it("replays a legacy artifact event without hash or version fields from SQLite", async () => {
    const root = await scaffold();
    const databasePath = join(root, "events.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const result = await runProject(root, {
      eventStore: store,
      script: [{ type: "artifact.write", files: [{ path: "legacy.md", content: "legacy" }] }],
    });
    const database = new DatabaseSync(databasePath);
    const event = result.events.find((item) => item.type === "artifact.file.written");
    if (event?.type !== "artifact.file.written") throw new Error("Missing artifact event");
    database.prepare("UPDATE events SET payload_json = ? WHERE stream_id = ? AND sequence = ?").run(
      JSON.stringify({
        path: event.payload.path,
        content: event.payload.content,
        mimeType: event.payload.mimeType,
      }),
      result.runId,
      event.sequence,
    );

    const replayed = await store.getEvents(result.runId);
    const workspace = buildArtifactWorkspace(result.runId, replayed);

    expect(workspace?.files).toEqual([
      {
        path: "legacy.md",
        content: "legacy",
        mimeType: "text/plain",
        version: 1,
        contentHash: "c49fea7425fa7f8699897a97c159c6690267d9003bb78c53fafa8fc15c325d84",
      },
    ]);
    expect(workspace?.versions).toEqual([
      {
        path: "legacy.md",
        mimeType: "text/plain",
        version: 1,
        contentHash: "c49fea7425fa7f8699897a97c159c6690267d9003bb78c53fafa8fc15c325d84",
        runId: result.runId,
        createdAt: event.timestamp,
      },
    ]);
    database.close();
  });

  it("fails event reads when an artifact receipt has no stored content", async () => {
    const root = await scaffold();
    const databasePath = join(root, "events.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const result = await runProject(root, {
      eventStore: store,
      script: [{ type: "artifact.write", files: [{ path: "missing.md", content: "body" }] }],
    });
    const database = new DatabaseSync(databasePath);
    database.prepare("DELETE FROM artifact_content").run();

    await expect(store.getEvents(result.runId)).rejects.toThrow("is missing from storage");
    database.close();
  });
});
