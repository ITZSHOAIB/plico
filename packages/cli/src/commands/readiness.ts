import { checkReadiness } from "@plico/runtime";
import { lastPositional, parseArgs } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatReadinessReport } from "../format/readiness.js";
import { resolveDatabasePath } from "../paths.js";

export async function readinessCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, { flags: ["--json"], values: {}, rejectUnknown: true });
    const target = lastPositional(parsed, process.cwd());
    const databasePath = resolveDatabasePath(target, undefined);
    const report = await checkReadiness(target, { databasePath });

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
