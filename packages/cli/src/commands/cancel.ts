import { createSqliteEngine, createSqliteEventStore } from "@plico/runtime";
import { parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { ensureDatabaseExists, resolveDatabasePath } from "../paths.js";

export async function cancelCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json"],
      values: { "--db": { missing: "Missing database path after --db" } },
      rejectUnknown: true,
    });
    const [runId, ...rest] = parsed.positionals;
    if (!runId) throw new Error("Missing run ID for cancel command");
    const target = rest.at(-1) ?? process.cwd();
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    await ensureDatabaseExists(databasePath);

    const eventStore = createSqliteEventStore({ databasePath });
    if (!(await eventStore.getRun(runId))) {
      console.error(`Unknown run ID: ${runId}`);
      return 1;
    }

    const result = await createSqliteEngine({ databasePath }).cancel(runId);
    if (parsed.flags.has("--json")) {
      console.log(JSON.stringify({ runId, result }));
    } else if (result === "accepted") {
      console.log(`Cancellation requested for run ${runId}.`);
    } else if (result === "ignored") {
      console.log(`Run ${runId} is already finished or cancelled.`);
    } else {
      console.error(`Run ${runId} is not known to the execution engine.`);
    }
    return result === "unknown" ? 1 : 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
