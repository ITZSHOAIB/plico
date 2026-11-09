import { randomUUID } from "node:crypto";
import { ARTIFACT_TOOL_NAMES, SKILL_TOOL_NAME, validateProject } from "@plico-ai/core";
import {
  createSqliteEngine,
  createSqliteEventStore,
  loadProjectEnv,
  type ModelProvider,
  modelProviderRecoveryKey,
  recoverRuns,
  runProject,
} from "@plico-ai/runtime";
import { lastPositional, parseArgs, readStringOption } from "../args.js";
import { errorMessage } from "../errors.js";
import { formatRunResult } from "../format/run.js";
import { resolveDatabasePath } from "../paths.js";
import { loadDryRunScript } from "../script-file.js";
import { cancelOnInterrupt } from "./interrupt.js";
import { streamModelOutput } from "./live-output.js";
import { resolveMessage, resolveModelProvider } from "./model-provider.js";

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
    const persist = parsed.flags.has("--persist") || !dry;
    const target = lastPositional(parsed, process.cwd());
    loadProjectEnv(target);
    const scriptPath = readStringOption(parsed, "--script");
    const dbPath = readStringOption(parsed, "--db");
    let message = readStringOption(parsed, "--message");

    if (!dry && scriptPath) throw new Error("--script requires --dry.");
    const script = scriptPath ? await loadDryRunScript(scriptPath) : undefined;
    const databasePath = persist ? resolveDatabasePath(target, dbPath) : undefined;
    const validation = databasePath ? await validateProject(target) : undefined;
    if (!dry && (!validation?.ok || !validation.project)) {
      throw new Error("Project is invalid. Run plico validate for details.");
    }
    const provider = dry
      ? message === undefined
        ? undefined
        : createFakeProvider()
      : resolveModelProvider(validation?.project?.config.model, target);
    if (!dry) message = await resolveMessage(message);
    const recoveryKey = dry
      ? "plico:dry-fake:v1"
      : validation?.project?.config.model
        ? modelProviderRecoveryKey(validation.project.config.model)
        : undefined;
    const eventStore = databasePath ? createSqliteEventStore({ databasePath }) : undefined;
    const leaseMs = validation?.project?.config.execution?.leaseMs;
    const engine = databasePath
      ? createSqliteEngine({ databasePath, ...(leaseMs === undefined ? {} : { leaseMs }) })
      : undefined;
    const runId = !dry ? `run-${randomUUID()}` : undefined;
    const interruption = engine && runId ? cancelOnInterrupt(engine, runId) : undefined;
    const recovery =
      engine && eventStore
        ? recoverRuns({
            engine,
            eventStore,
            recoveryFilter: {
              projectRoot: target,
              ...(recoveryKey ? { providerRecoveryKey: recoveryKey } : {}),
            },
            ...(dry ? { provider: createFakeProvider() } : provider ? { provider } : {}),
            ...(interruption
              ? {
                  onRecoveryStarted: interruption.onRecoveryStarted,
                  onRecoverySettled: interruption.onRecoverySettled,
                }
              : {}),
          }).then(
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

    const outputStore = eventStore && !dry && !json ? streamModelOutput(eventStore) : eventStore;
    const resultPromise = runProject(target, {
      ...(script ? { script } : {}),
      ...(outputStore ? { eventStore: outputStore } : {}),
      ...(engine ? { engine } : {}),
      ...(message === undefined ? {} : { message }),
      ...(provider === undefined ? {} : { provider }),
      ...(recoveryKey === undefined || provider === undefined
        ? {}
        : { providerRecoveryKey: recoveryKey }),
      ...(runId === undefined ? {} : { runId }),
      ...(interruption === undefined ? {} : { onStarted: interruption.onStarted }),
    });

    const trackedResult = resultPromise.finally(() => interruption?.onCompleted());
    void Promise.allSettled([trackedResult, recovery]).then(() => interruption?.dispose());
    const result = await trackedResult;

    if (json) {
      console.log(JSON.stringify(result));
    } else if (result.status === "failed" && result.errors?.length) {
      for (const error of result.errors) {
        console.error(`${error.path}: ${error.message}`);
      }
    } else if (!dry) {
      process.stdout.write("\n");
      if (result.status !== "completed") {
        for (const line of formatRunResult(target, result, false)) console.error(line);
      } else if (persist) {
        console.log(`Persisted run ID: ${result.runId}`);
      }
    } else {
      for (const line of formatRunResult(target, result, dry)) {
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
    async *stream(request) {
      const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user");
      const lastToolMessage = [...request.messages].reverse().find((m) => m.role === "tool");
      const tool = request.tools?.find(
        ({ name }) =>
          name !== SKILL_TOOL_NAME &&
          !ARTIFACT_TOOL_NAMES.includes(name as (typeof ARTIFACT_TOOL_NAMES)[number]),
      );
      if (!lastToolMessage && tool) {
        yield { type: "tool.call", call: { name: tool.name, arguments: { title: "Test ticket" } } };
        yield { type: "finish", usage: { inputTokens: 10, outputTokens: 1 } };
        return;
      }
      yield { type: "text", text: `Fake provider response to: ${lastUserMessage?.content ?? ""}` };
      yield { type: "finish", usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
}
