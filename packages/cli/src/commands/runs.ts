import { access } from "node:fs/promises";
import { createSqliteEventStore } from "@plico-ai/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatRunSummaries } from "../format/runs.js";
import { resolveDatabasePath } from "../paths.js";

export async function runsCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json"],
      values: { "--db": { missing: "Missing database path after --db" } },
      rejectUnknown: true,
    });
    const json = parsed.flags.has("--json");
    const target = lastPositional(parsed, process.cwd());
    const dbPath = readStringOption(parsed, "--db");
    const databasePath = resolveDatabasePath(target, dbPath);
    try {
      await access(databasePath);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      if (dbPath !== undefined) throw new Error(`Missing database: ${databasePath}`);
      if (parsed.flags.has("--json")) console.log("[]");
      else console.log("No saved runs found.");
      return 0;
    }
    const eventStore = createSqliteEventStore({ databasePath });
    const runs = await eventStore.listRuns();

    if (json) {
      console.log(JSON.stringify(runs));
    } else if (runs.length === 0) {
      console.log("No saved runs found.");
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
