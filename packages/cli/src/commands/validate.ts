import { validateProject } from "@plico/core";
import { lastPositional, parseArgs } from "../args.js";

export async function validateCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args, { flags: ["--json"], values: {}, rejectUnknown: false });
  const json = parsed.flags.has("--json");
  const target = lastPositional(parsed, process.cwd());
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
