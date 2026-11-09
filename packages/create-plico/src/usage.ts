import { createRequire } from "node:module";

export const USAGE: string = [
  "Usage: create-plico [directory] [project name] [--provider anthropic|openai|google|openai-compatible]",
  "       create-plico --help | --version",
].join("\n");

export function readVersion(): string {
  const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
  return pkg.version;
}
