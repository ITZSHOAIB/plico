import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths } from "@plico-ai/core";
import { createSqliteEventStore, evalCaseFromRun } from "@plico-ai/runtime";

/** Writes a stored run into the project's evals folder and returns the file it created. */
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
  const file = join(folder, `${name}.script.json`);
  await mkdir(folder, { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(evalCase, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`${file} already exists. Pick another --name.`);
    throw error;
  }
  return file;
}
