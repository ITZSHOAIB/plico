import { pathToFileURL } from "node:url";
import { evalCommand } from "./commands/eval.js";
import { eventsCommand } from "./commands/events.js";
import { readinessCommand } from "./commands/readiness.js";
import { runCommand } from "./commands/run.js";
import { runsCommand } from "./commands/runs.js";
import { serveCommand } from "./commands/serve.js";
import { usageCommand } from "./commands/usage.js";
import { validateCommand } from "./commands/validate.js";

type Command = (args: string[]) => Promise<number>;

const commands: Readonly<Record<string, Command>> = {
  validate: validateCommand,
  run: runCommand,
  runs: runsCommand,
  events: eventsCommand,
  serve: serveCommand,
  readiness: readinessCommand,
  eval: evalCommand,
};

export async function main(argv: string[]): Promise<number> {
  const name = argv[2] ?? "help";
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;

  if (!command) {
    return usageCommand();
  }

  return command(argv.slice(3));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
