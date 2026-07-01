import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateProject } from "@plico/core";
import {
  createSqliteEventStore,
  type DryRunScriptStep,
  type PlicoEvent,
  type RunSummary,
  runProject,
} from "@plico/runtime";

export async function main(argv: string[]): Promise<number> {
  const command = argv[2] ?? "help";

  if (command === "validate") {
    const { json, target } = parseValidateArgs(argv.slice(3));
    const result = await validateProject(target);

    if (json) {
      console.log(JSON.stringify(result));
      return result.ok ? 0 : 1;
    }

    if (result.ok) {
      for (const warning of result.warnings) {
        console.warn(`${warning.path}: ${warning.message}`);
      }
      console.log(`Valid Plico project: ${target}`);
      return 0;
    }

    for (const error of result.errors) {
      console.error(`${error.path}: ${error.message}`);
    }

    for (const warning of result.warnings) {
      console.warn(`${warning.path}: ${warning.message}`);
    }

    return 1;
  }

  if (command === "run") {
    try {
      const { dbPath, dry, json, persist, target, scriptPath } = parseRunArgs(argv.slice(3));
      if (!dry) {
        console.error("plico run only supports --dry in this release.");
        return 1;
      }

      const script = scriptPath ? await loadDryRunScript(scriptPath) : undefined;
      const eventStore = persist
        ? createSqliteEventStore({
            databasePath: resolveDatabasePath(target, dbPath),
          })
        : undefined;
      const result = await runProject(target, {
        ...(script ? { script } : {}),
        ...(eventStore ? { eventStore } : {}),
      });

      if (json) {
        console.log(JSON.stringify(result));
      } else {
        if (result.status === "failed" && result.errors?.length) {
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
      }

      return result.status === "completed" ? 0 : 1;
    } catch (error) {
      console.error(errorMessage(error));
      return 1;
    }
  }

  if (command === "runs") {
    try {
      const { dbPath, json, target } = parseRunsArgs(argv.slice(3));
      const databasePath = resolveDatabasePath(target, dbPath);
      await ensureDatabaseExists(databasePath);
      const eventStore = createSqliteEventStore({ databasePath });
      const runs = await eventStore.listRuns();

      if (json) {
        console.log(JSON.stringify(runs));
      } else {
        for (const line of formatRunSummaries(target, databasePath, runs)) {
          console.log(line);
        }
      }

      return 0;
    } catch (error) {
      console.error(errorMessage(error));
      return 1;
    }
  }

  if (command === "events") {
    try {
      const { afterSequence, dbPath, json, runId, target } = parseEventsArgs(argv.slice(3));
      const databasePath = resolveDatabasePath(target, dbPath);
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

  console.log("Usage: plico validate [path]");
  console.log("Usage: plico run --dry [--persist] [--db <path>] [--json] [--script <file>] [path]");
  console.log("Usage: plico runs [--db <path>] [--json] [path]");
  console.log("Usage: plico events <runId> [--after <sequence>] [--db <path>] [--json] [path]");
  return 0;
}

function parseValidateArgs(args: string[]): { json: boolean; target: string } {
  let json = false;
  let target = process.cwd();

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }

    target = arg;
  }

  return { json, target };
}

function parseRunArgs(args: string[]): {
  dbPath?: string;
  dry: boolean;
  json: boolean;
  persist: boolean;
  target: string;
  scriptPath?: string;
} {
  let dry = false;
  let json = false;
  let persist = false;
  let target = process.cwd();
  let scriptPath: string | undefined;
  let dbPath: string | undefined;
  let awaitingScriptPath = false;
  let awaitingDbPath = false;

  for (const arg of args) {
    if (awaitingDbPath) {
      dbPath = arg;
      awaitingDbPath = false;
      continue;
    }

    if (awaitingScriptPath) {
      scriptPath = arg;
      awaitingScriptPath = false;
      continue;
    }

    if (arg === "--dry") {
      dry = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--persist") {
      persist = true;
      continue;
    }

    if (arg === "--script") {
      awaitingScriptPath = true;
      continue;
    }

    if (arg === "--db") {
      awaitingDbPath = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    target = arg;
  }

  if (awaitingDbPath) {
    throw new Error("Missing database path after --db");
  }

  if (awaitingScriptPath) {
    throw new Error("Missing script file after --script");
  }

  return {
    dry,
    json,
    persist,
    target,
    ...(scriptPath === undefined ? {} : { scriptPath }),
    ...(dbPath === undefined ? {} : { dbPath }),
  };
}

function parseRunsArgs(args: string[]): {
  dbPath?: string;
  json: boolean;
  target: string;
} {
  let json = false;
  let target = process.cwd();
  let dbPath: string | undefined;
  let awaitingDbPath = false;

  for (const arg of args) {
    if (awaitingDbPath) {
      dbPath = arg;
      awaitingDbPath = false;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--db") {
      awaitingDbPath = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    target = arg;
  }

  if (awaitingDbPath) {
    throw new Error("Missing database path after --db");
  }

  return {
    json,
    target,
    ...(dbPath === undefined ? {} : { dbPath }),
  };
}

function parseEventsArgs(args: string[]): {
  afterSequence?: number;
  dbPath?: string;
  json: boolean;
  runId: string;
  target: string;
} {
  let json = false;
  let afterSequence: number | undefined;
  let target = process.cwd();
  let runId: string | undefined;
  let dbPath: string | undefined;
  let awaitingAfter = false;
  let awaitingDbPath = false;

  for (const arg of args) {
    if (awaitingAfter) {
      afterSequence = parseCursor(arg);
      awaitingAfter = false;
      continue;
    }

    if (awaitingDbPath) {
      dbPath = arg;
      awaitingDbPath = false;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--after") {
      awaitingAfter = true;
      continue;
    }

    if (arg === "--db") {
      awaitingDbPath = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (runId === undefined) {
      runId = arg;
      continue;
    }

    target = arg;
  }

  if (awaitingAfter) {
    throw new Error("Missing sequence after --after");
  }

  if (awaitingDbPath) {
    throw new Error("Missing database path after --db");
  }

  if (!runId) {
    throw new Error("Missing run ID for events command");
  }

  return {
    json,
    runId,
    target,
    ...(afterSequence === undefined ? {} : { afterSequence }),
    ...(dbPath === undefined ? {} : { dbPath }),
  };
}

async function loadDryRunScript(scriptPath: string): Promise<DryRunScriptStep[]> {
  try {
    const raw = await readFile(scriptPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("Dry run script must be a JSON array of steps.");
    }

    return parsed.map((step, index) => normalizeScriptStep(step, index, scriptPath));
  } catch (error) {
    throw new Error(`Unable to parse dry run script ${scriptPath}: ${errorMessage(error)}`);
  }
}

function normalizeScriptStep(step: unknown, index: number, scriptPath: string): DryRunScriptStep {
  if (!isRecord(step) || typeof step.type !== "string") {
    throw new Error(`Script step ${index + 1} in ${scriptPath} must be an object with a type.`);
  }

  if (step.type === "assistant.output") {
    if (typeof step.content !== "string") {
      throw new Error(`Script step ${index + 1} in ${scriptPath} must include string content.`);
    }

    return {
      type: "assistant.output",
      content: step.content,
    };
  }

  if (step.type === "tool.call") {
    if (typeof step.toolName !== "string") {
      throw new Error(`Script step ${index + 1} in ${scriptPath} must include a toolName string.`);
    }

    return {
      type: "tool.call",
      toolName: step.toolName,
      arguments: step.arguments,
    };
  }

  throw new Error(
    `Script step ${index + 1} in ${scriptPath} has an unsupported type: ${step.type}`,
  );
}

function parseCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Malformed cursor: ${value}`);
  }

  return parsed;
}

function resolveDatabasePath(target: string, dbPath: string | undefined): string {
  return dbPath ?? join(target, ".plico", "plico.sqlite");
}

async function ensureDatabaseExists(databasePath: string): Promise<void> {
  try {
    await access(databasePath, fsConstants.F_OK);
  } catch {
    throw new Error(`Missing database: ${databasePath}`);
  }
}

function formatRunSummaries(target: string, databasePath: string, runs: RunSummary[]): string[] {
  const lines = [`Persisted runs for ${target} (${databasePath})`];

  if (runs.length === 0) {
    lines.push("No persisted runs found.");
    return lines;
  }

  for (const run of runs) {
    const summary = [run.runId, run.status, run.projectName || "unknown project", run.endedAt].join(
      " | ",
    );
    lines.push(summary);
  }

  return lines;
}

function formatEvents(runId: string, events: PlicoEvent[]): string[] {
  const lines = [`Events for ${runId}`];

  for (const event of events) {
    lines.push(`${event.sequence} ${event.type} ${JSON.stringify(event.payload)}`);
  }

  return lines;
}

function formatRunResult(target: string, result: Awaited<ReturnType<typeof runProject>>): string[] {
  const lines = [`Running dry runtime for ${target}`];

  for (const event of result.events) {
    if (event.type === "run.started") {
      lines.push(`run.started: ${readString(event.payload.projectName) ?? "unknown project"}`);
      continue;
    }

    if (event.type === "instructions.composed") {
      lines.push(`instructions.composed: ${readCount(event.payload.sources)} source(s)`);
      continue;
    }

    if (event.type === "tools.discovered") {
      lines.push(`tools.discovered: ${readCount(event.payload.tools)} tool(s)`);
      continue;
    }

    if (event.type === "assistant.output") {
      lines.push(`assistant.output: ${readString(event.payload.content) ?? ""}`);
      continue;
    }

    if (event.type === "tool.call") {
      lines.push(`tool.call: ${readString(event.payload.toolName) ?? "unknown tool"}`);
      continue;
    }

    if (event.type === "tool.result") {
      lines.push(`tool.result: ${readString(event.payload.toolName) ?? "unknown tool"}`);
      continue;
    }

    if (event.type === "approval.required") {
      lines.push(`approval.required: ${readString(event.payload.toolName) ?? "unknown tool"}`);
      continue;
    }

    if (event.type === "run.blocked") {
      lines.push("run.blocked: approval required");
      continue;
    }

    if (event.type === "run.completed") {
      lines.push("run.completed: completed");
      continue;
    }

    if (event.type === "run.failed") {
      lines.push("run.failed: failed");
      continue;
    }

    if (event.type === "run.error") {
      lines.push(`run.error: ${readString(event.payload.message) ?? "runtime error"}`);
    }
  }

  if (result.status === "blocked") {
    lines.push("Dry run blocked.");
  } else if (result.status === "failed") {
    lines.push("Dry run failed.");
  }

  return lines;
}

function readCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
