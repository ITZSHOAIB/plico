import { runEvals } from "@plico/runtime";
import { lastPositional, parseArgs } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatEvalSummary } from "../format/eval.js";

export async function evalCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, { flags: ["--json"], values: {}, rejectUnknown: true });
    const target = lastPositional(parsed, process.cwd());
    const summary = await runEvals(target);

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
