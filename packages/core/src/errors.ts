import { getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

export class ProjectConfigError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly issues: ValidationIssue[],
  ) {
    super(`Invalid config at ${configPath}`);
  }
}

export function missingFileMessage(error: unknown): string {
  const relativePaths = getProjectRelativePaths();

  if (error instanceof Error && error.message.includes("ENOENT")) {
    return `Missing required file: ${relativePaths.configFile}`;
  }

  return `Unable to read ${relativePaths.configFile}`;
}

export function missingFileMessageFor(path: string, error: unknown): string {
  if (error instanceof Error && error.message.includes("ENOENT")) {
    return `Missing required file: ${path}`;
  }

  return `Unable to read ${path}`;
}

export function configLoadMessage(error: unknown): string {
  const relativePaths = getProjectRelativePaths();

  if (error instanceof Error && error.message) {
    return `Failed to execute ${relativePaths.configFile}: ${error.message}`;
  }

  return `Failed to execute ${relativePaths.configFile}`;
}
