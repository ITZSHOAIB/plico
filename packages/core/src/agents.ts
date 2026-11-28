import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig } from "@plico-ai/contracts";
import { parseAgentFile } from "./agent-file.js";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

/** Root `agent.md` is always this agent. */
export const MAIN_AGENT_ID = "main";
export const AGENTS_DIRECTORY = "agents";
export const DEFAULT_MAX_DELEGATIONS = 8;
export const AGENT_ID_PATTERN: RegExp = /^[a-z][a-z0-9_-]*$/;

export type ArtifactAccess = NonNullable<ProjectConfig["artifacts"]>["access"];
export type AgentModel = Partial<NonNullable<ProjectConfig["model"]>>;

/** One agent as written in its Markdown file. Omitted fields keep their documented defaults. */
export interface AgentDefinition {
  id: string;
  /** Project-relative path, `agent.md` or `agents/<id>.md`. */
  source: string;
  /** Absolute path, used to resolve a Zod schema's package. */
  file: string;
  /** The text after the frontmatter. */
  instructions: string;
  description?: string;
  /** Fields that override the project model. */
  model?: AgentModel;
  /** Project tools the agent may call. Undefined means all of them. */
  tools?: string[];
  /** Skills the agent sees. Undefined means all of them. */
  skills?: string[];
  /** Agents this one may delegate to. */
  agents: string[];
  artifacts?: ArtifactAccess;
  maxDelegations?: number;
  input?: unknown;
  output?: unknown;
}

export interface AgentsResult {
  /** `main` first, then the others by ID. */
  agents: AgentDefinition[];
  issues: ValidationIssue[];
}

const MODEL_KEYS = [
  "provider",
  "name",
  "baseURL",
  "apiKeyEnv",
  "maxSteps",
  "retries",
  "retryDelayMs",
];
const ACCESS = ["read-write", "read-only", "off"];

/** Reads root `agent.md` and every `agents/<id>.md`. A missing `agent.md` is left to validation. */
export async function readAgents(root: string): Promise<AgentsResult> {
  const paths = getProjectPaths(root);
  const agents: AgentDefinition[] = [];
  const issues: ValidationIssue[] = [];
  const main = await readOptional(paths.agentFile);
  if (main !== undefined) {
    const read = readAgent(
      MAIN_AGENT_ID,
      getProjectRelativePaths().agentFile,
      paths.agentFile,
      main,
    );
    agents.push(read.agent);
    issues.push(...read.issues.filter((issue) => !issue.message.startsWith("Invalid frontmatter")));
  }

  const directory = join(root, AGENTS_DIRECTORY);
  let entries: string[] = [];
  try {
    entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    entries = [];
  }
  for (const name of entries) {
    const id = name.slice(0, -".md".length);
    const source = `${AGENTS_DIRECTORY}/${name}`;
    if (id === MAIN_AGENT_ID) {
      issues.push({
        path: source,
        message: `${MAIN_AGENT_ID} is root agent.md. Move these instructions there or rename the file.`,
        severity: "error",
      });
      continue;
    }
    if (!AGENT_ID_PATTERN.test(id)) {
      issues.push({
        path: source,
        message: `Agent ID "${id}" must start with a lowercase letter and use only lowercase letters, digits, "-" and "_".`,
        severity: "error",
      });
      continue;
    }
    const file = join(directory, name);
    const read = readAgent(id, source, file, await readFile(file, "utf8"));
    if (read.agent.instructions.trim() === "")
      read.issues.push({ path: source, message: `${source} must not be empty`, severity: "error" });
    agents.push(read.agent);
    issues.push(...read.issues);
  }
  return { agents, issues };
}

function readAgent(
  id: string,
  source: string,
  file: string,
  text: string,
): { agent: AgentDefinition; issues: ValidationIssue[] } {
  const parsed = parseAgentFile(text);
  const data = parsed.data;
  const issues: ValidationIssue[] = [];
  const error = (message: string) => issues.push({ path: source, message, severity: "error" });
  if (parsed.error) error(`Invalid frontmatter in ${source}: ${parsed.error}`);

  const agent: AgentDefinition = { id, source, file, instructions: parsed.body, agents: [] };
  if (data.description !== undefined) {
    if (typeof data.description === "string" && data.description.trim())
      agent.description = data.description.trim();
    else error("Expected description to be non-empty text");
  }
  for (const key of ["tools", "skills", "agents"] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.every((item) => typeof item === "string" && item))
      agent[key] = [...new Set(value as string[])];
    else error(`Expected ${key} to be a list of names`);
  }
  if (data.model !== undefined) {
    const model = data.model;
    if (
      typeof model !== "object" ||
      model === null ||
      Array.isArray(model) ||
      Object.keys(model).some((key) => !MODEL_KEYS.includes(key))
    )
      error(`Expected model to be a mapping of ${MODEL_KEYS.join(", ")}`);
    else agent.model = model as AgentModel;
  }
  if (data.artifacts !== undefined) {
    if (ACCESS.includes(data.artifacts as string))
      agent.artifacts = data.artifacts as ArtifactAccess;
    else error('Expected artifacts to be "read-write", "read-only", or "off"');
  }
  if (data.maxDelegations !== undefined) {
    if (Number.isSafeInteger(data.maxDelegations) && Number(data.maxDelegations) > 0)
      agent.maxDelegations = Number(data.maxDelegations);
    else error("Expected maxDelegations to be a positive integer");
  }
  if (data.input !== undefined) agent.input = data.input;
  if (data.output !== undefined) agent.output = data.output;
  return { agent, issues };
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** The project model with an agent's overrides applied, or undefined when neither sets one. */
export function resolveAgentModel(
  project: ProjectConfig["model"],
  agent: AgentModel | undefined,
): ProjectConfig["model"] {
  if (!agent) return project;
  const merged = { ...project, ...agent };
  if (typeof merged.provider !== "string" || typeof merged.name !== "string") return project;
  return merged as NonNullable<ProjectConfig["model"]>;
}

/** The access an agent ends up with. An agent can only narrow the project's. */
export function resolveAgentArtifacts(
  project: ArtifactAccess,
  agent?: ArtifactAccess,
): ArtifactAccess {
  if (!agent) return project;
  return ACCESS.indexOf(agent) >= ACCESS.indexOf(project) ? agent : project;
}
