import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReadiness, createSqliteEventStore } from "../index.js";

async function scaffold(options: { tools?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-readiness-unit-"));
  for (const dir of ["skills", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  if (options.tools !== false) await mkdir(join(root, "tools"), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  return root;
}

describe("checkReadiness", () => {
  it("reports a diagnostic instead of throwing when tools/ is missing", async () => {
    const root = await scaffold({ tools: false });

    const report = await checkReadiness(root);

    expect(report.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("does not create files or directories while checking", async () => {
    const root = await scaffold();
    const before = await readdir(root, { recursive: true });

    await checkReadiness(root);

    expect(await readdir(root, { recursive: true })).toEqual(before);
  });

  it("treats an attached event store as persistence being available", async () => {
    const root = await scaffold();
    const databasePath = join(root, "elsewhere.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const report = await checkReadiness(root, { eventStore });

    const persistence = report.diagnostics.filter((d) => d.subsystem === "persistence.storage");
    expect(persistence.map((d) => d.severity)).toEqual(["ok"]);
  });
});
