const USAGE_LINES: readonly string[] = [
  "Usage: plico validate [path]",
  "Usage: plico run --dry [--persist] [--db <path>] [--json] [--script <file>] [--message <text>] [path]",
  "Usage: plico runs [--db <path>] [--json] [path]",
  "Usage: plico events <runId> [--after <sequence>] [--db <path>] [--json] [path]",
  "Usage: plico eval [--json] [--db <path>] [path]",
  "Usage: plico readiness [--json] [--db <path>] [path]",
  "Usage: plico serve [--host <host>] [--port <port>] [--db <path>] [--studio] [--allow-remote] [path]",
];

export function usageCommand(stream: "stdout" | "stderr" = "stdout"): number {
  const write = stream === "stdout" ? console.log : console.error;
  for (const line of USAGE_LINES) {
    write(line);
  }
  return 0;
}
