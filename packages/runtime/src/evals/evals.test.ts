import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkReadiness, createSqliteEventStore, runEvals } from "../index.js";

const example = new URL("../../../../examples/internal-ops-agent", import.meta.url);

async function scaffold(evalCase: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(join(root, "evals", "case.script.json"), JSON.stringify(evalCase));
  return root;
}

const passing = { name: "ok", script: [{ type: "assistant.output", content: "Hi" }] };
const failing = { ...passing, name: "bad", expect: { outputContains: "nope" } };

function resultsDiagnostic(report: Awaited<ReturnType<typeof checkReadiness>>) {
  return report.diagnostics.find((d) => d.subsystem === "evals.results");
}

describe("eval fixture shapes", () => {
  it("runs a bare step array, the same shape plico run --script accepts, named after its file", async () => {
    const root = await scaffold(passing.script);

    const summary = await runEvals(root);

    expect(summary).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(summary.results[0]?.name).toBe("case");
  });

  it("names an object fixture after its file when it has no name", async () => {
    const root = await scaffold({ script: passing.script });

    const summary = await runEvals(root);

    expect(summary.results[0]?.name).toBe("case");
  });

  it("rejects a fixture without a script, naming the file", async () => {
    const root = await scaffold({ name: "broken" });

    await expect(runEvals(root)).rejects.toThrow("case.script.json");
  });

  it("runs the internal-ops example", async () => {
    const summary = await runEvals(fileURLToPath(example));

    expect(summary).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(summary.results[0]?.name).toBe("smoke");
  });
});

describe("persisted eval results", () => {
  it("stores the latest report, surviving a store reopen", async () => {
    const root = await scaffold(passing);
    const databasePath = join(root, "state.sqlite");

    await runEvals(root, { eventStore: createSqliteEventStore({ databasePath }) });

    const report = await createSqliteEventStore({ databasePath }).getLatestEvalReport();
    expect(report).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(report?.evaluatedAt).toEqual(expect.any(String));
  });

  it("returns undefined before any eval has run", async () => {
    const root = await scaffold(passing);
    const store = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });

    expect(await store.getLatestEvalReport()).toBeUndefined();
  });

  it("readiness reports passing results from the latest report", async () => {
    const root = await scaffold(passing);
    const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    await runEvals(root, { eventStore });

    const report = await checkReadiness(root, { eventStore });

    expect(resultsDiagnostic(report)).toMatchObject({ severity: "ok" });
    expect(resultsDiagnostic(report)?.message).toContain("1/1");
  });

  it("readiness reports an error when the latest eval failed, even if its run completed", async () => {
    const root = await scaffold(failing);
    const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    await runEvals(root, { eventStore });

    const report = await checkReadiness(root, { eventStore });

    expect(resultsDiagnostic(report)).toMatchObject({ severity: "error" });
    expect(resultsDiagnostic(report)?.message).toContain("bad");
  });
});

describe("read-only event store", () => {
  it("reads an existing database, including one without eval results", async () => {
    const root = await scaffold(passing);
    const databasePath = join(root, "state.sqlite");
    await runEvals(root, { eventStore: createSqliteEventStore({ databasePath }) });

    const store = createSqliteEventStore({ databasePath, readOnly: true });

    expect(await store.getLatestEvalReport()).toMatchObject({ total: 1 });
    await expect(
      store.persistEvalReport({
        total: 0,
        passed: 0,
        failed: 0,
        results: [],
        evaluatedAt: "now",
      }),
    ).rejects.toThrow();
  });
});

describe("studio assets readiness", () => {
  it("warns when Studio has not been built and passes once it has", async () => {
    const root = await scaffold(passing);
    const studioPath = join(root, "studio-dist");

    const missing = await checkReadiness(root, { studioPath });
    await mkdir(studioPath);
    await writeFile(join(studioPath, "index.html"), "<html></html>");
    const built = await checkReadiness(root, { studioPath });

    const find = (r: typeof built) => r.diagnostics.find((d) => d.subsystem === "studio.assets");
    expect(find(missing)).toMatchObject({ severity: "warning" });
    expect(find(built)).toMatchObject({ severity: "ok" });
  });

  it("does not report Studio when it is not configured", async () => {
    const root = await scaffold(passing);

    const report = await checkReadiness(root);

    expect(report.diagnostics.some((d) => d.subsystem === "studio.assets")).toBe(false);
  });
});
