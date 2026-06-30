import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateProject } from "@plico/core";
import { type DryRunScriptStep, runProject } from "@plico/runtime";

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
      const { dry, json, target, scriptPath } = parseRunArgs(argv.slice(3));
      if (!dry) {
        console.error("plico run only supports --dry in this release.");
        return 1;
      }

      const script = scriptPath ? await loadDryRunScript(scriptPath) : undefined;
      const result = await runProject(target, script ? { script } : {});

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
        }
      }

      return result.status === "completed" ? 0 : 1;
    } catch (error) {
      console.error(errorMessage(error));
      return 1;
    }
  }

  console.log("Usage: plico validate [path]");
  console.log("Usage: plico run --dry [--json] [--script <file>] [path]");
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
  dry: boolean;
  json: boolean;
  target: string;
  scriptPath?: string;
} {
  let dry = false;
  let json = false;
  let target = process.cwd();
  let scriptPath: string | undefined;
  let awaitingScriptPath = false;

  for (const arg of args) {
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

    if (arg === "--script") {
      awaitingScriptPath = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    target = arg;
  }

  if (awaitingScriptPath) {
    throw new Error("Missing script file after --script");
  }

  return {
    dry,
    json,
    target,
    ...(scriptPath === undefined ? {} : { scriptPath }),
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
