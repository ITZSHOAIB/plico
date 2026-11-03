import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const runChild = promisify(execFile);

it("recovers an approval after the host is killed and executes the tool once", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-approval-process-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const marks = join(root, "marks.txt");
  await writeFile(marks, "");
  await writeFile(
    join(root, "tools", "approve.tool.ts"),
    `import { appendFileSync } from "node:fs";
    export default { name: "approve", description: "test", inputSchema: { type: "object", properties: {}, additionalProperties: false },
      capabilities: [], approval: { required: true }, handler: async () => { appendFileSync(${JSON.stringify(marks)}, "ran\\n"); return "ok"; } };`,
  );
  const databasePath = join(root, "state.sqlite");
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
    const [root, databasePath] = process.argv.slice(1);
    const result = await runProject(root, { runId: "approval", script: [{type: "tool.call", toolName: "approve", arguments: {}}],
      engine: createSqliteEngine({ databasePath }), eventStore: createSqliteEventStore({ databasePath }) });
    if (result.status !== "waiting") throw new Error("did not wait");
    process.kill(process.pid, "SIGKILL");`;
  await expect(
    runChild(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      program,
      root,
      databasePath,
    ]),
  ).rejects.toThrow();
  const resume = `import { createSqliteEngine, createSqliteEventStore, recoverRuns } from ${JSON.stringify(moduleUrl)};
    const databasePath = process.argv[1];
    const engine = createSqliteEngine({ databasePath }); const store = createSqliteEventStore({ databasePath });
    await recoverRuns({ engine, eventStore: store });
    if (await engine.signal("approval", "approval:approval:0", { approved: true }) !== "accepted") throw new Error("signal failed");
    for (let i = 0; i < 200; i++) { if ((await store.getRun("approval"))?.status === "completed") process.exit(0); await new Promise(r => setTimeout(r, 10)); }
    throw new Error("did not finish");`;
  await runChild(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    resume,
    databasePath,
  ]);
  expect(await readFile(marks, "utf8")).toBe("ran\n");
}, 30000);
