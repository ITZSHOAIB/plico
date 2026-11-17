import { validateProject } from "@plico-ai/core";
import { lastPositional, type ParsedArgs, parseArgs } from "../args.js";
import { errorMessage } from "../errors.js";

export async function validateCommand(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: plico validate [path]");
    return 0;
  }
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args, { flags: ["--json"], values: {}, rejectUnknown: true });
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
  const json = parsed.flags.has("--json");
  const target = lastPositional(parsed, process.cwd());
  const result = await validateProject(target);

  if (json) {
    console.log(JSON.stringify(result));
    return result.ok ? 0 : 1;
  }

  if (result.ok) {
    for (const warning of result.warnings) {
      console.warn(`${where(warning)}: ${warning.message}`);
    }
    console.log(`Valid Plico project: ${target}`);
    return 0;
  }

  for (const error of result.errors) {
    console.error(`${where(error)}: ${error.message}`);
  }

  for (const warning of result.warnings) {
    console.warn(`${where(warning)}: ${warning.message}`);
  }

  return 1;
}

function where(issue: { path: string; line?: number }): string {
  return issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`;
}
