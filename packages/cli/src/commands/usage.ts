const USAGE_LINES: readonly string[] = [
  "Usage: plico validate [path]",
  "Usage: plico run [--agent <id> | --workflow <id>] [--db <path>] [--json] [--message <text>] [--input <json> | --input-file <path>] [path]",
  "Usage: plico run --dry [--agent <id> | --workflow <id>] [--persist] [--db <path>] [--json] [--script <file>] [--message <text>] [--input <json> | --input-file <path>] [path]",
  "Usage: plico cancel <runId> [--db <path>] [--json] [path]",
  "Usage: plico runs [--parent <run-id>] [--db <path>] [--json] [path]",
  "Usage: plico events <runId> [--after <sequence>] [--db <path>] [--json] [path]",
  "Usage: plico eval [--json] [--allow-empty] [--live [--mock-tools] [--model <provider:model>] [--max-tokens <n>] [--concurrency <n>]] [--from-run <run-id> [--name <name>]] [--baseline <file>] [--save-baseline] [--tolerance <n>] [--format <md|junit>] [--db <path>] [path]",
  "Usage: plico eval compare [--tolerance <n>] [--json] <a> <b>",
  "Usage: plico eval rescore [--format <md|junit>] [--json] <report> [project]",
  "Usage: plico readiness [--json] [--db <path>] [path]",
  "Usage: plico serve [--host <host>] [--port <port>] [--db <path>] [--studio] [--allow-remote] [--allow-script] [--inspect] [path]",
];

export function usageCommand(stream: "stdout" | "stderr" = "stdout", command?: string): number {
  const write = stream === "stdout" ? console.log : console.error;
  const lines = command
    ? USAGE_LINES.filter((line) => line.startsWith(`Usage: plico ${command} `))
    : USAGE_LINES;
  for (const line of lines) {
    write(line);
  }
  return 0;
}
