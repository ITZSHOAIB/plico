import { createSqliteEventStore } from "@plico/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatRunSummaries } from "../format/runs.js";
import { ensureDatabaseExists, resolveDatabasePath } from "../paths.js";

export async function runsCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json"],
      values: { "--db": { missing: "Missing database path after --db" } },
      rejectUnknown: true,
    });
    const json = parsed.flags.has("--json");
    const target = lastPositional(parsed, process.cwd());
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    await ensureDatabaseExists(databasePath);
    const eventStore = createSqliteEventStore({ databasePath });
    const runs = await eventStore.listRuns();

    if (json) {
      console.log(JSON.stringify(runs));
    } else {
      for (const line of formatRunSummaries(target, databasePath, runs)) {
        console.log(line);
      }
    }

    return 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
