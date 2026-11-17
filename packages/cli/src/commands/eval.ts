import { join } from "node:path";
import { createSqliteEventStore, readEvalReport, runEvals } from "@plico-ai/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatEvalSummary } from "../format/eval.js";
import { formatEvalReport } from "../format/eval-report.js";
import { resolveDatabasePath } from "../paths.js";
import { LIVE_FLAGS, LIVE_VALUES, readLiveOptions } from "./eval-live.js";
import { promoteRun } from "./eval-promote.js";
import { reportBaseline, reportCommand } from "./eval-reports.js";

export async function evalCommand(args: string[]): Promise<number> {
  try {
    if (args[0] === "compare" || args[0] === "rescore") return await reportCommand(args);
    const parsed = parseArgs(args, {
      flags: ["--save-baseline", "--json", "--allow-empty", ...LIVE_FLAGS],
      values: {
        ...LIVE_VALUES,
        "--baseline": { missing: "Missing baseline file" },
        "--tolerance": { missing: "Missing tolerance" },
        "--format": { missing: "Missing format" },
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
    const live = await readLiveOptions(parsed, target);
    const eventStore = createSqliteEventStore({ databasePath });
    const summary = await runEvals(target, { eventStore, ...(live ? { live } : {}) });

    const regressed = summary.reportId
      ? await reportBaseline(
          target,
          summary.reportId,
          readStringOption(parsed, "--baseline"),
          parsed.flags.has("--save-baseline"),
          readStringOption(parsed, "--tolerance"),
        )
      : false;
    const format = readStringOption(parsed, "--format");
    if (format && summary.reportId) {
      console.log(
        formatEvalReport(
          await readEvalReport(join(target, ".plico", "evals", `${summary.reportId}.json`)),
          format,
        ),
      );
    } else if (parsed.flags.has("--json")) {
      console.log(JSON.stringify(summary));
    } else {
      for (const line of formatEvalSummary(target, summary)) {
        console.log(line);
      }
    }

    if (summary.total === 0 && !parsed.flags.has("--allow-empty")) {
      console.error(
        summary.skipped.length > 0
          ? `No eval case ran: ${summary.skipped.length} skipped. ${live ? "Give cases an input" : "Add fixtures"} or pass --allow-empty.`
          : "No eval cases found, so nothing was tested. Add cases under evals/ or pass --allow-empty.",
      );
      return 1;
    }

    if (summary.tokenCapReached) {
      console.error(
        `Token cap of ${live?.maxTokens} reached before every case ran. Raise --max-tokens to run them all.`,
      );
      return 1;
    }
    return summary.failed > 0 || regressed ? 1 : 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
