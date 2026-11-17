import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatEvalCase, getProjectPaths } from "@plico-ai/core";
import { createSqliteEventStore, evalCaseFromRun } from "@plico-ai/runtime";

/**
 * Writes a stored run into the project's evals folder as `<name>.md` and its `<name>.script.json`
 * fixture, and returns the Markdown case it created.
 */
export async function promoteRun(
  target: string,
  databasePath: string,
  runId: string,
  name: string,
): Promise<string> {
  if (name === "." || name === ".." || /[\\/]/.test(name))
    throw new Error(`Invalid --name "${name}". Use a plain file name without path separators.`);
  const store = createSqliteEventStore({ databasePath, readOnly: true });
  const run = await store.getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const evalCase = evalCaseFromRun(name, run.status, await store.getEvents(runId));

  const folder = getProjectPaths(target).directories.evals;
  const file = join(folder, `${name}.md`);
  const fixture = join(folder, `${name}.script.json`);
  await mkdir(folder, { recursive: true });
  await writeNew(fixture, `${JSON.stringify(evalCase.script, null, 2)}\n`);
  try {
    await writeNew(file, formatEvalCase({ expect: evalCase.expect ?? {} }));
  } catch (error) {
    await rm(fixture, { force: true });
    throw error;
  }
  return file;
}

async function writeNew(file: string, text: string): Promise<void> {
  try {
    await writeFile(file, text, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`${file} already exists. Pick another --name.`);
    throw error;
  }
}
