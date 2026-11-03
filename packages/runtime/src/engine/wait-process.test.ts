import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const runChild = promisify(execFile);

it("keeps the original wait deadline after a killed process restarts", async () => {
  const databasePath = join(await mkdtemp(join(tmpdir(), "plico-wait-process-")), "state.sqlite");
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/engine/index.ts")).href;
  const start = `import { createSqliteEngine } from ${JSON.stringify(moduleUrl)};
    const engine = createSqliteEngine({ databasePath: process.argv[1] });
    await engine.run("run", async ctx => ctx.wait("decision", { timeoutMs: 3000 }), {});
    process.kill(process.pid, "SIGKILL");`;
  await expect(
    runChild(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      start,
      databasePath,
    ]),
  ).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const resume = `import { createSqliteEngine } from ${JSON.stringify(moduleUrl)};
    const engine = createSqliteEngine({ databasePath: process.argv[1] });
    await engine.recover(() => async ctx => ctx.wait("decision", { timeoutMs: 3000 }));
    for (let i = 0; i < 250; i++) { if ((await engine.status("run"))?.state === "completed") process.exit(0); await new Promise(r => setTimeout(r, 10)); }
    throw new Error("original deadline was not preserved");`;
  await runChild(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    resume,
    databasePath,
  ]);
}, 15000);

it("keeps a waiting run cancelled across a process restart", async () => {
  const databasePath = join(await mkdtemp(join(tmpdir(), "plico-cancel-process-")), "state.sqlite");
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/engine/index.ts")).href;
  const start = `import { createSqliteEngine } from ${JSON.stringify(moduleUrl)};
    const engine = createSqliteEngine({ databasePath: process.argv[1] });
    await engine.run("run", async ctx => ctx.wait("decision"), {});
    process.kill(process.pid, "SIGKILL");`;
  await expect(
    runChild(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      start,
      databasePath,
    ]),
  ).rejects.toThrow();
  const cancel = `import { createSqliteEngine } from ${JSON.stringify(moduleUrl)};
    const engine = createSqliteEngine({ databasePath: process.argv[1] });
    if (await engine.cancel("run") !== "accepted") throw new Error("cancel rejected");
    await engine.recover(() => async ctx => ctx.wait("decision"));
    if ((await engine.status("run"))?.state !== "cancelled") throw new Error("not cancelled");`;
  await runChild(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    cancel,
    databasePath,
  ]);
  const verify = `import { createSqliteEngine } from ${JSON.stringify(moduleUrl)};
    const engine = createSqliteEngine({ databasePath: process.argv[1] });
    await engine.recover(() => async ctx => ctx.wait("decision"));
    if ((await engine.status("run"))?.state !== "cancelled") throw new Error("cancellation lost");`;
  await runChild(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    verify,
    databasePath,
  ]);
}, 15000);
