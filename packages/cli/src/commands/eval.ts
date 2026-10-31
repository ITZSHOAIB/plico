import { createSqliteEventStore, runEvals } from "@plico/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatEvalSummary } from "../format/eval.js";
import { resolveDatabasePath } from "../paths.js";

export async function evalCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json"],
      values: { "--db": { missing: "Missing database path after --db" } },
      rejectUnknown: true,
    });
    const target = lastPositional(parsed, process.cwd());
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    const eventStore = createSqliteEventStore({ databasePath });
    const summary = await runEvals(target, { eventStore });

    if (parsed.flags.has("--json")) {
      console.log(JSON.stringify(summary));
    } else {
      for (const line of formatEvalSummary(target, summary)) {
        console.log(line);
      }
    }

    return summary.failed > 0 ? 1 : 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
