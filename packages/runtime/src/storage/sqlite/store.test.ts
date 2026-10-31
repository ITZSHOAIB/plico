import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSqliteEventStore } from "../../index.js";

describe("createSqliteEventStore", () => {
  it("opens the database in WAL mode so readers do not block the writer", async () => {
    const databasePath = join(await mkdtemp(join(tmpdir(), "plico-wal-")), "db.sqlite");
    createSqliteEventStore({ databasePath });

    const probe = new DatabaseSync(databasePath);
    const row = probe.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    probe.close();

    expect(row.journal_mode).toBe("wal");
  });
});
