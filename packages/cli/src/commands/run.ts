import { validateProject } from "@plico/core";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type ModelProvider,
  recoverRuns,
  runProject,
} from "@plico/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatRunResult } from "../format/run.js";
import { resolveDatabasePath } from "../paths.js";
import { loadDryRunScript } from "../script-file.js";

export async function runCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--dry", "--json", "--persist"],
      values: {
        "--script": { missing: "Missing script file after --script" },
        "--message": { missing: "Missing message text after --message" },
        "--db": { missing: "Missing database path after --db" },
      },
      rejectUnknown: true,
    });
    const dry = parsed.flags.has("--dry");
    const json = parsed.flags.has("--json");
    const persist = parsed.flags.has("--persist");
    const target = lastPositional(parsed, process.cwd());
    const scriptPath = readStringOption(parsed, "--script");
    const dbPath = readStringOption(parsed, "--db");
    const message = readStringOption(parsed, "--message");

    if (!dry) {
      console.error("plico run only supports --dry in this release.");
      return 1;
    }

    const script = scriptPath ? await loadDryRunScript(scriptPath) : undefined;
    const databasePath = persist ? resolveDatabasePath(target, dbPath) : undefined;
    const eventStore = databasePath ? createSqliteEventStore({ databasePath }) : undefined;
    const validation = databasePath ? await validateProject(target) : undefined;
    const leaseMs = validation?.project?.config.execution?.leaseMs;
    const engine = databasePath
      ? createSqliteEngine({ databasePath, ...(leaseMs === undefined ? {} : { leaseMs }) })
      : undefined;
    const recovery =
      engine && eventStore
        ? recoverRuns({ engine, eventStore }).then(
            (runs) => {
              for (const run of runs)
                console.error(
                  `Recovered run ${run.runId}: ${run.state}${run.error ? ` (${run.error})` : ""}`,
                );
            },
            (error: unknown) => {
              console.error(`Recovery incomplete: ${errorMessage(error)}`);
            },
          )
        : Promise.resolve();

    const resultPromise = runProject(target, {
      ...(script ? { script } : {}),
      ...(eventStore ? { eventStore } : {}),
      ...(engine ? { engine } : {}),
      ...(message === undefined ? {} : { provider: createFakeProvider(), message }),
    });

    const [requested] = await Promise.allSettled([resultPromise, recovery]);
    if (requested.status === "rejected") throw requested.reason;
    const result = requested.value;

    if (json) {
      console.log(JSON.stringify(result));
    } else if (result.status === "failed" && result.errors?.length) {
      for (const error of result.errors) {
        console.error(`${error.path}: ${error.message}`);
      }
    } else {
      for (const line of formatRunResult(target, result)) {
        if (result.status === "completed") {
          console.log(line);
        } else {
          console.error(line);
        }
      }
      if (persist && result.status === "completed") {
        console.log(`Persisted run ID: ${result.runId}`);
      }
    }

    // Exit 0 for completion, 2 when waiting for approval, and 1 for anything else.
    return result.status === "completed" ? 0 : result.status === "waiting" ? 2 : 1;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}

/** Deterministic stand-in used by `--message` until real providers are wired in. */
function createFakeProvider(): ModelProvider {
  return {
    complete: async (request) => {
      const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user");
      const lastToolMessage = [...request.messages].reverse().find((m) => m.role === "tool");
      if (!lastToolMessage && request.tools && request.tools.length > 0) {
        const tool = request.tools[0];
        if (tool) {
          return {
            content: "",
            usage: { inputTokens: 10, outputTokens: 1 },
            toolCalls: [{ name: tool.name, arguments: { title: "Test ticket" } }],
          };
        }
      }
      const assistantContent = `Fake provider response to: ${lastUserMessage?.content ?? ""}`;
      return { content: assistantContent, usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
}
