const USAGE_LINES: readonly string[] = [
  "Usage: plico validate [path]",
  "Usage: plico run --dry [--persist] [--db <path>] [--json] [--script <file>] [--message <text>] [path]",
  "Usage: plico runs [--db <path>] [--json] [path]",
  "Usage: plico events <runId> [--after <sequence>] [--db <path>] [--json] [path]",
  "Usage: plico eval [--json] [path]",
  "Usage: plico readiness [--json] [path]",
  "Usage: plico serve [--host <host>] [--port <port>] [--db <path>] [--studio] [path]",
];

export function usageCommand(): number {
  for (const line of USAGE_LINES) {
    console.log(line);
  }
  return 0;
}
