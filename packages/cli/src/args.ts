export interface ValueOption {
  /** Message thrown when the option is the last argument and has no value. */
  missing: string;
  /** Optional converter; may throw to reject a malformed value. */
  parse?: (value: string) => unknown;
}

export interface ArgSpec {
  /** Boolean flags, e.g. `--json`. */
  flags: readonly string[];
  /** Options that consume the following argument, keyed by option name. */
  values: Readonly<Record<string, ValueOption>>;
  /** When false, any other `-`-prefixed argument is treated as a positional. */
  rejectUnknown: boolean;
}

export interface ParsedArgs {
  flags: ReadonlySet<string>;
  values: ReadonlyMap<string, unknown>;
  positionals: string[];
}

export function parseArgs(args: readonly string[], spec: ArgSpec): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, unknown>();
  const positionals: string[] = [];
  let pending: string | undefined;

  for (const arg of args) {
    if (pending !== undefined) {
      const option = spec.values[pending];
      values.set(pending, option?.parse ? option.parse(arg) : arg);
      pending = undefined;
      continue;
    }

    if (spec.flags.includes(arg)) {
      flags.add(arg);
      continue;
    }

    if (Object.hasOwn(spec.values, arg)) {
      pending = arg;
      continue;
    }

    if (spec.rejectUnknown && arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (pending !== undefined) {
    throw new Error(spec.values[pending]?.missing ?? `Missing value after ${pending}`);
  }

  return { flags, values, positionals };
}

export function readStringOption(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.values.get(name);
  return typeof value === "string" ? value : undefined;
}

export function readNumberOption(parsed: ParsedArgs, name: string): number | undefined {
  const value = parsed.values.get(name);
  return typeof value === "number" ? value : undefined;
}

export function lastPositional(parsed: ParsedArgs, fallback: string): string {
  return parsed.positionals.at(-1) ?? fallback;
}

export function parseCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Malformed cursor: ${value}`);
  }

  return parsed;
}

export function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}
