import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { evalCommand } from "./commands/eval.js";
import { eventsCommand } from "./commands/events.js";
import { readinessCommand } from "./commands/readiness.js";
import { runCommand } from "./commands/run.js";
import { runsCommand } from "./commands/runs.js";
import { serveCommand } from "./commands/serve.js";
import { usageCommand } from "./commands/usage.js";
import { validateCommand } from "./commands/validate.js";

function readVersion(): string {
  const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
  return pkg.version;
}

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

  if (name === "help" || name === "--help" || name === "-h") {
    return usageCommand();
  }

  if (name === "--version" || name === "-v") {
    console.log(readVersion());
    return 0;
  }

  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;

  if (!command) {
    console.error(`Unknown command: ${name}`);
    usageCommand("stderr");
    return 1;
  }

  return command(argv.slice(3));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
