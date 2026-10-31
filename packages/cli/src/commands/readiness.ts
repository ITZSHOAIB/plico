import { checkReadiness } from "@plico/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatReadinessReport } from "../format/readiness.js";
import { findStudioPath, resolveDatabasePath } from "../paths.js";

export async function readinessCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json"],
      values: { "--db": { missing: "Missing database path after --db" } },
      rejectUnknown: true,
    });
    const target = lastPositional(parsed, process.cwd());
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    const report = await checkReadiness(target, { databasePath, studioPath: findStudioPath() });

    if (parsed.flags.has("--json")) {
      console.log(JSON.stringify(report));
    } else {
      for (const line of formatReadinessReport(report)) {
        console.log(line);
      }
    }

    return report.summary.error > 0 ? 1 : 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
