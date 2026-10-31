import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const passing = { name: "ok", script: [{ type: "assistant.output", content: "Hi" }] };
const failing = { ...passing, name: "bad", expect: { outputContains: "nope" } };

async function project(evalCase: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
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

function captureLog() {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return vi.spyOn(console, "log").mockImplementation(() => undefined);
}

async function readinessJson(...args: string[]) {
  const log = captureLog();
  const exitCode = await main(["node", "plico", "readiness", "--json", ...args]);
  const report = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as {
    diagnostics: Array<{ subsystem: string; severity: string }>;
  };
  return { exitCode, report };
}

describe("plico eval persistence", () => {
  it("persists traces and the report to the default database", async () => {
    const root = await project(passing);
    captureLog();

    expect(await main(["node", "plico", "eval", "--json", root])).toBe(0);

    const store = createSqliteEventStore({ databasePath: join(root, ".plico", "plico.sqlite") });
    expect(await store.getLatestEvalReport()).toMatchObject({ total: 1, passed: 1 });
    const [run] = await store.listRuns();
    expect(await store.getEvents(run?.runId ?? "")).not.toEqual([]);
  });

  it("persists to the path given with --db", async () => {
    const root = await project(passing);
    const databasePath = join(root, "custom", "eval.sqlite");
    captureLog();

    await main(["node", "plico", "eval", "--db", databasePath, root]);

    const store = createSqliteEventStore({ databasePath });
    expect(await store.getLatestEvalReport()).toMatchObject({ total: 1 });
  });
});

describe("plico readiness with eval results", () => {
  it("reports passing results after plico eval", async () => {
    const root = await project(passing);
    captureLog();
    await main(["node", "plico", "eval", root]);

    const { exitCode, report } = await readinessJson(root);

    expect(exitCode).toBe(0);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ subsystem: "evals.results", severity: "ok" }),
    );
  });

  it("exits 1 when the latest evals failed", async () => {
    const root = await project(failing);
    captureLog();
    await main(["node", "plico", "eval", root]);

    const { exitCode, report } = await readinessJson(root);

    expect(exitCode).toBe(1);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ subsystem: "evals.results", severity: "error" }),
    );
  });

  it("reads results from the path given with --db", async () => {
    const root = await project(passing);
    const databasePath = join(root, "custom.sqlite");
    captureLog();
    await main(["node", "plico", "eval", "--db", databasePath, root]);

    const { report } = await readinessJson("--db", databasePath, root);

    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ subsystem: "evals.results", severity: "ok" }),
    );
  });

  it("does not create a database", async () => {
    const root = await project(passing);

    await readinessJson(root);

    await expect(access(join(root, ".plico"))).rejects.toThrow();
  });

  it("reports whether Studio is built", async () => {
    const root = await project(passing);

    const { report } = await readinessJson(root);

    expect(report.diagnostics.map((d) => d.subsystem)).toContain("studio.assets");
  });
});
