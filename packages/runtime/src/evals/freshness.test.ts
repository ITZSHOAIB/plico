import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { checkReadiness, createSqliteEventStore, runEvals } from "../index.js";

const passing = { name: "ok", script: [{ type: "assistant.output", content: "Hi" }] };
const failing = { ...passing, name: "bad", expect: { outputContains: "nope" } };

async function scaffold(fixtures: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-freshness-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  for (const [name, fixture] of Object.entries(fixtures)) {
    await writeFile(fixturePath(root, name), JSON.stringify(fixture));
  }
  return root;
}

function fixturePath(root: string, name: string): string {
  return join(root, "evals", `${name}.script.json`);
}

function store(root: string) {
  return createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
}

async function diagnostic(root: string, subsystem: string, options = {}) {
  const report = await checkReadiness(root, options);
  return report.diagnostics.find((d) => d.subsystem === subsystem);
}

describe("eval verdicts", () => {
  it("fails a case whose run failed, even with no expectations", async () => {
    const root = await scaffold({
      broken: [{ type: "tool.call", toolName: "missing", arguments: {} }],
    });

    const summary = await runEvals(root);

    expect(summary).toMatchObject({ passed: 0, failed: 1 });
    expect(summary.results[0]).toMatchObject({ status: "fail", runStatus: "failed" });
    expect(summary.results[0]?.diagnostics).not.toEqual([]);
  });

  it("passes a failed run when the fixture expects it", async () => {
    const root = await scaffold({
      broken: {
        script: [{ type: "tool.call", toolName: "missing", arguments: {} }],
        expect: { status: "failed" },
      },
    });

    expect(await runEvals(root)).toMatchObject({ passed: 1, failed: 0 });
  });
});

describe("readiness against current fixtures", () => {
  it("treats results as stale once a failing fixture is deleted", async () => {
    const root = await scaffold({ good: passing, bad: failing });
    const eventStore = store(root);
    await runEvals(root, { eventStore });

    await rm(fixturePath(root, "bad"));

    const result = await diagnostic(root, "evals.results", { eventStore });
    expect(result).toMatchObject({ severity: "warning" });
    expect(result?.message).toContain("plico eval");
  });

  it("treats results as stale once a fixture is edited", async () => {
    const root = await scaffold({ good: passing });
    const eventStore = store(root);
    await runEvals(root, { eventStore });

    await writeFile(fixturePath(root, "good"), JSON.stringify({ ...passing, name: "renamed" }));

    expect(await diagnostic(root, "evals.results", { eventStore })).toMatchObject({
      severity: "warning",
    });
  });

  it("reports a malformed fixture as an error instead of trusting old results", async () => {
    const root = await scaffold({ good: passing });
    const eventStore = store(root);
    await runEvals(root, { eventStore });

    await writeFile(fixturePath(root, "broken"), "{ not json");

    const fixtures = await diagnostic(root, "evals.fixtures", { eventStore });
    expect(fixtures).toMatchObject({ severity: "error" });
    expect(fixtures?.message).toContain("broken.script.json");
  });

  it("says so when the latest eval run found no fixtures", async () => {
    const root = await scaffold({});
    const eventStore = store(root);
    await runEvals(root, { eventStore });

    const result = await diagnostic(root, "evals.results", { eventStore });

    expect(result).toMatchObject({ severity: "warning" });
    expect(result?.message).toContain("no fixtures");
  });
});

describe("persistence readiness", () => {
  it("reports an unreadable database instead of blaming evals/", async () => {
    const root = await scaffold({ good: passing });
    const databasePath = join(root, "state.sqlite");
    await writeFile(databasePath, "x".repeat(4096));

    const report = await checkReadiness(root, { databasePath });

    const find = (subsystem: string) => report.diagnostics.find((d) => d.subsystem === subsystem);
    expect(find("persistence.storage")).toMatchObject({ severity: "error" });
    expect(find("evals.fixtures")).toMatchObject({ severity: "ok" });
  });

  it("reports a path that cannot be opened as a database", async () => {
    const root = await scaffold({ good: passing });
    const databasePath = join(root, "state.sqlite");
    await mkdir(databasePath);

    const result = await diagnostic(root, "persistence.storage", { databasePath });

    expect(result).toMatchObject({ severity: "error" });
  });

  it("reports a database that cannot be written", async () => {
    const root = await scaffold({ good: passing });
    const databasePath = join(root, "state.sqlite");
    store(root);
    await chmod(databasePath, 0o444);

    const result = await diagnostic(root, "persistence.storage", { databasePath });
    await chmod(databasePath, 0o644);

    expect(result).toMatchObject({ severity: "error" });
    expect(result?.message).toContain("not writable");
  });

  it("confirms a writable database", async () => {
    const root = await scaffold({ good: passing });
    const databasePath = join(root, "state.sqlite");
    store(root);

    const result = await diagnostic(root, "persistence.storage", { databasePath });

    expect(result).toMatchObject({ severity: "ok" });
    expect(result?.message).toContain("writable");
  });
});

describe("artifact readiness", () => {
  it.skipIf(process.platform === "win32")(
    "reports an unwritable artifacts/ directory",
    async () => {
      const root = await scaffold({});
      await chmod(join(root, "artifacts"), 0o555);

      const result = await diagnostic(root, "artifacts.workspace");
      await chmod(join(root, "artifacts"), 0o755);

      expect(result).toMatchObject({ severity: "error" });
    },
  );

  it("confirms a writable artifacts/ directory", async () => {
    const root = await scaffold({});

    const result = await diagnostic(root, "artifacts.workspace");

    expect(result).toMatchObject({ severity: "ok" });
    expect(result?.message).toContain("writable");
  });
});

describe("stored eval report versions", () => {
  const report = { total: 0, passed: 0, failed: 0, results: [], evaluatedAt: "now" };

  it("stamps new reports with a schema version", async () => {
    const root = await scaffold({ good: passing });
    const eventStore = store(root);
    await runEvals(root, { eventStore });

    expect((await eventStore.getLatestEvalReport())?.schemaVersion).toBe(1);
  });

  it("reads a report with an unknown schema version as absent", async () => {
    const root = await scaffold({});
    const eventStore = store(root);
    await eventStore.persistEvalReport({
      ...report,
      schemaVersion: 2 as 1,
      fixturesDigest: "digest",
    });

    expect(await eventStore.getLatestEvalReport()).toBeUndefined();
  });
});

describe("read-only event store", () => {
  it("leaves no sidecar files next to a cleanly closed WAL database", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readonly-"));
    const databasePath = join(root, "state.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA journal_mode = WAL; CREATE TABLE marker (id INTEGER);");
    database.close();

    await createSqliteEventStore({ databasePath, readOnly: true }).getLatestEvalReport();

    expect(await readdir(root)).toEqual(["state.sqlite"]);
  });
});
