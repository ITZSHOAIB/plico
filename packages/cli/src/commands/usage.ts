const USAGE_LINES: readonly string[] = [
  "Usage: plico validate [path]",
  "Usage: plico run [--db <path>] [--json] [--message <text>] [path]",
  "Usage: plico run --dry [--persist] [--db <path>] [--json] [--script <file>] [--message <text>] [path]",
  "Usage: plico cancel <runId> [--db <path>] [--json] [path]",
  "Usage: plico runs [--db <path>] [--json] [path]",
  "Usage: plico events <runId> [--after <sequence>] [--db <path>] [--json] [path]",
  "Usage: plico eval [--json] [--allow-empty] [--from-run <run-id> [--name <name>]] [--db <path>] [path]",
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
