import type { RunStatus, ValidationIssue } from "@plico-ai/contracts";
import { stringify } from "yaml";
import { parseLocatedFrontmatter, type YamlPath } from "./located-frontmatter.js";

/** Code checks over a whole run, written as `expect:` in an eval case. */
export interface EvalCaseExpect {
  status?: RunStatus;
  contains?: string;
  tool?: string[];
  notTool?: string[];
  artifact?: string[];
  maxTokens?: number;
  maxLatencyMs?: number;
  /** Fields of the run's `structuredOutput`. */
  output?: Record<string, unknown>;
}

export interface EvalScorerRef {
  use: string;
  /** Lowest passing score. Defaults to 1. */
  threshold?: number;
}

/** An eval case as written in `evals/<name>.md`. */
export interface EvalCaseDefinition {
  input?: unknown;
  expect: EvalCaseExpect;
  mocks: Record<string, unknown>;
  trials: number;
  tags: string[];
  judge?: string;
  scorers: EvalScorerRef[];
  /** Body bullets, each judged yes or no. */
  criteria: string[];
}

export type ParsedEvalCase =
  | { kind: "missing-frontmatter" }
  | {
      kind: "case";
      definition: EvalCaseDefinition;
      issues: ValidationIssue[];
      lineAt(path: YamlPath): number;
    };

const RUN_STATUSES: readonly string[] = ["completed", "failed", "waiting", "cancelled"];

type Check = (value: unknown) => string | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const positiveInteger: Check = (v) =>
  Number.isInteger(v) && (v as number) > 0 ? undefined : "must be a whole number above 0";
const text: Check = (v) => (typeof v === "string" && v !== "" ? undefined : "must be text");
const names: Check = (v) =>
  text(v) === undefined || (Array.isArray(v) && v.length > 0 && v.every((n) => !text(n)))
    ? undefined
    : "must be a name or a list of names";
const mapping: Check = (v) => (isRecord(v) ? undefined : "must be a mapping of names to values");

const EXPECT_CHECKS: Record<keyof EvalCaseExpect, Check> = {
  status: (v) =>
    RUN_STATUSES.includes(v as string) ? undefined : `must be one of ${RUN_STATUSES.join(", ")}`,
  contains: text,
  tool: names,
  notTool: names,
  artifact: names,
  maxTokens: positiveInteger,
  maxLatencyMs: positiveInteger,
  output: mapping,
};

const plainName = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v);
const scorer: Check = (v) => {
  if (typeof v === "string")
    return plainName(v) ? undefined : "name must be a plain name: letters, digits, - and _";
  if (!isRecord(v) || text(v.use)) return "must be a scorer name or { use: <name>, threshold }";
  if (!plainName(v.use)) return "name must be a plain name: letters, digits, - and _";
  const threshold = v.threshold;
  if (
    threshold !== undefined &&
    !(typeof threshold === "number" && threshold >= 0 && threshold <= 1)
  )
    return "threshold must be a number from 0 to 1";
  const unknown = Object.keys(v).find((key) => key !== "use" && key !== "threshold");
  return unknown ? `has unknown key "${unknown}"` : undefined;
};

const TOP_LEVEL_CHECKS: Record<string, Check> = {
  input: () => undefined,
  expect: mapping,
  mocks: mapping,
  trials: positiveInteger,
  tags: (v) =>
    Array.isArray(v) && v.every((t) => !text(t)) ? undefined : "must be a list of tags",
  judge: (v) =>
    typeof v === "string" && /^[^:\s]+:\S+$/.test(v) ? undefined : "must be <provider>:<model>",
  scorers: (v) => (Array.isArray(v) ? undefined : "must be a list of scorers"),
};

/** Reads `evals/<name>.md`: frontmatter checks with line numbers, and criteria from body bullets. */
export function parseEvalCase(path: string, source: string): ParsedEvalCase {
  const frontmatter = parseLocatedFrontmatter(source);
  if (frontmatter.data === undefined) return { kind: "missing-frontmatter" };

  const issues: ValidationIssue[] = [];
  const issue = (at: YamlPath, message: string) =>
    issues.push({ path, line: frontmatter.lineAt(at), message, severity: "error" });
  const lineAt = frontmatter.lineAt;
  const criteria = readCriteria(frontmatter.body);
  const empty = { expect: {}, mocks: {}, trials: 1, tags: [], scorers: [], criteria };

  if (frontmatter.error) {
    issues.push({
      path,
      line: frontmatter.error.line,
      message: frontmatter.error.message,
      severity: "error",
    });
    return { kind: "case", definition: empty, issues, lineAt };
  }
  const data = frontmatter.data;
  if (!isRecord(data)) {
    issue([], "Frontmatter must be a mapping of keys to values.");
    return { kind: "case", definition: empty, issues, lineAt };
  }

  checkKeys(data, TOP_LEVEL_CHECKS, [], issue);
  if (isRecord(data.expect)) checkKeys(data.expect, EXPECT_CHECKS, ["expect"], issue);
  if (Array.isArray(data.scorers))
    data.scorers.forEach((entry, index) => {
      const problem = scorer(entry);
      if (problem) issue(["scorers", index], `Scorer ${problem}.`);
    });
  issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  if (issues.length > 0) return { kind: "case", definition: empty, issues, lineAt };

  const expect = { ...(data.expect as Record<string, unknown>) };
  for (const key of ["tool", "notTool", "artifact"])
    if (typeof expect[key] === "string") expect[key] = [expect[key]];
  const definition: EvalCaseDefinition = {
    ...empty,
    expect: expect as EvalCaseExpect,
    mocks: (data.mocks as Record<string, unknown>) ?? {},
    trials: (data.trials as number) ?? 1,
    tags: (data.tags as string[]) ?? [],
    scorers: ((data.scorers as unknown[]) ?? []).map((entry) =>
      typeof entry === "string" ? { use: entry } : (entry as EvalScorerRef),
    ),
  };
  if (data.input !== undefined) definition.input = data.input;
  if (typeof data.judge === "string") definition.judge = data.judge;
  return { kind: "case", definition, issues, lineAt };
}

function checkKeys(
  data: Record<string, unknown>,
  checks: Record<string, Check>,
  at: YamlPath,
  issue: (path: YamlPath, message: string) => void,
): void {
  const where = at.length ? `${at.join(".")}.` : "";
  for (const [key, value] of Object.entries(data)) {
    const check = checks[key];
    if (!check) {
      issue(
        [...at, key],
        `Unknown key "${where}${key}". Known keys: ${Object.keys(checks).join(", ")}.`,
      );
      continue;
    }
    const problem = check(value);
    if (problem) issue([...at, key], `"${where}${key}" ${problem}.`);
  }
}

function readCriteria(body: string): string[] {
  return body
    .split("\n")
    .map((line) => /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => Boolean(line));
}

/** Writes an eval case as Markdown with frontmatter, the format `parseEvalCase` reads. */
export function formatEvalCase(
  definition: Partial<Pick<EvalCaseDefinition, "input" | "expect" | "criteria">>,
): string {
  const data: Record<string, unknown> = {};
  if (definition.input !== undefined) data.input = definition.input;
  if (definition.expect && Object.keys(definition.expect).length > 0)
    data.expect = definition.expect;
  const criteria = (definition.criteria ?? []).map((line) => `- ${line}\n`).join("");
  return `---\n${Object.keys(data).length ? stringify(data) : ""}---\n${criteria}`;
}
