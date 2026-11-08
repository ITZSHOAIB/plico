import { createSqliteEventStore, runEvals } from "@plico/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatEvalSummary } from "../format/eval.js";
import { resolveDatabasePath } from "../paths.js";
import { promoteRun } from "./eval-promote.js";

export async function evalCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json", "--allow-empty"],
      values: {
        "--db": { missing: "Missing database path after --db" },
        "--from-run": { missing: "Missing run id after --from-run" },
        "--name": { missing: "Missing case name after --name" },
      },
      rejectUnknown: true,
    });
    const target = lastPositional(parsed, process.cwd());
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    const fromRun = readStringOption(parsed, "--from-run");
    if (fromRun !== undefined) {
      const name = readStringOption(parsed, "--name") ?? fromRun;
      console.log(`Wrote ${await promoteRun(target, databasePath, fromRun, name)}`);
      return 0;
    }
    const eventStore = createSqliteEventStore({ databasePath });
    const summary = await runEvals(target, { eventStore });

    if (parsed.flags.has("--json")) {
      console.log(JSON.stringify(summary));
    } else {
      for (const line of formatEvalSummary(target, summary)) {
        console.log(line);
      }
    }

    if (summary.total === 0 && !parsed.flags.has("--allow-empty")) {
      console.error(
        "No eval cases found, so nothing was tested. Add cases under evals/ or pass --allow-empty.",
      );
      return 1;
    }

    return summary.failed > 0 ? 1 : 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
