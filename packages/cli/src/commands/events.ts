import { createSqliteEventStore } from "@plico/runtime";
import { parseArgs, parseCursor, readNumberOption, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatEvents } from "../format/events.js";
import { ensureDatabaseExists, resolveDatabasePath } from "../paths.js";

export async function eventsCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--json"],
      values: {
        "--after": { missing: "Missing sequence after --after", parse: parseCursor },
        "--db": { missing: "Missing database path after --db" },
      },
      rejectUnknown: true,
    });
    const [runId, ...rest] = parsed.positionals;
    if (!runId) {
      throw new Error("Missing run ID for events command");
    }

    const json = parsed.flags.has("--json");
    const target = rest.at(-1) ?? process.cwd();
    const afterSequence = readNumberOption(parsed, "--after");
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    await ensureDatabaseExists(databasePath);
    const eventStore = createSqliteEventStore({ databasePath });
    const run = await eventStore.getRun(runId);

    if (!run) {
      console.error(`Unknown run ID: ${runId}`);
      return 1;
    }

    const events = await eventStore.getEvents(
      runId,
      afterSequence === undefined ? {} : { afterSequence },
    );

    if (json) {
      console.log(JSON.stringify(events));
    } else {
      for (const line of formatEvents(runId, events)) {
        console.log(line);
      }
    }

    return 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}
