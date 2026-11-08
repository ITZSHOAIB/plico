import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

export interface Skill {
  /** The file name without `.md`. The agent loads the skill by this name. */
  name: string;
  description: string;
  /** Project-relative path, such as `skills/triage.md`. */
  source: string;
  /** The skill text without its frontmatter. */
  body: string;
}

export interface SkillsResult {
  /** Skills that have a description, sorted by file name. */
  skills: Skill[];
  issues: ValidationIssue[];
}

/** Reads every `skills/*.md` file. A file that cannot be read throws. */
export async function readSkills(root: string): Promise<SkillsResult> {
  const directory = getProjectPaths(root).directories.skills;
  const relative = getProjectRelativePaths().directories.skills;
  const files = (await readdir(directory))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  const skills: Skill[] = [];
  const issues: ValidationIssue[] = [];
  for (const file of files) {
    const source = `${relative}/${file}`;
    const { data, body } = parseFrontmatter(await readFile(join(directory, file), "utf8"));
    const description = data.description?.trim();
    if (!description) {
      issues.push({
        path: source,
        message: `Skill ${source} needs a description. Add "description: <when to use this skill>" in a frontmatter block at the top of the file.`,
        severity: "error",
      });
      continue;
    }
    skills.push({ name: file.slice(0, -".md".length), description, source, body });
  }
  return { skills, issues };
}

/** Skill problems for `plico validate`. Unreadable files are left for the run to report. */
export async function validateSkills(root: string): Promise<ValidationIssue[]> {
  try {
    return (await readSkills(root)).issues;
  } catch {
    return [];
  }
}
