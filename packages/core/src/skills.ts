import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

export interface Skill {
  /** The folder name. The agent loads the skill by this name. */
  name: string;
  description: string;
  /** Project-relative path, such as `skills/triage/SKILL.md`. */
  source: string;
  /** The skill text without its frontmatter. */
  body: string;
}

export interface SkillsResult {
  /** Skills that have a description, sorted by folder name. */
  skills: Skill[];
  issues: ValidationIssue[];
}

const SKILL_FILE = "SKILL.md";

/** Reads every `skills/<name>/SKILL.md` file. A file that cannot be read throws. */
export async function readSkills(root: string): Promise<SkillsResult> {
  const directory = getProjectPaths(root).directories.skills;
  const relative = getProjectRelativePaths().directories.skills;
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  const skills: Skill[] = [];
  const issues: ValidationIssue[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = entry.name.slice(0, -".md".length);
      issues.push({
        path: `${relative}/${entry.name}`,
        message: `Skills are folders. Move ${relative}/${entry.name} to ${relative}/${name}/${SKILL_FILE}.`,
        severity: "error",
      });
      continue;
    }
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const folder = `${relative}/${entry.name}`;
    const source = `${folder}/${SKILL_FILE}`;
    if (!(await readdir(join(directory, entry.name))).includes(SKILL_FILE)) {
      issues.push({
        path: folder,
        message: `Skill folder ${folder} needs a ${SKILL_FILE} file.`,
        severity: "error",
      });
      continue;
    }
    const text = await readFile(join(directory, entry.name, SKILL_FILE), "utf8");
    const { data, body } = parseFrontmatter(text);
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (!description) {
      issues.push({
        path: source,
        message: `Skill ${source} needs a description. Add "description: <when to use this skill>" in a frontmatter block at the top of the file.`,
        severity: "error",
      });
      continue;
    }
    skills.push({ name: entry.name, description, source, body });
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
