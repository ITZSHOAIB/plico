import { readFile } from "node:fs/promises";
import {
  getProjectPaths,
  getProjectRelativePaths,
  type LoadedProject,
  parseAgentFile,
  readSkills,
  SKILL_TOOL_NAME,
  type Skill,
} from "@plico-ai/core";
import type { ComposedInstructions } from "./types/index.js";

/** The agent's instructions plus a list of skills. A skill's full text loads on demand. */
export async function composeInstructions(
  project: LoadedProject,
  loaded?: Skill[],
): Promise<ComposedInstructions> {
  const projectPaths = getProjectPaths(project.root);
  const sources = [getProjectRelativePaths().agentFile];
  const parts = [parseAgentFile(await readFile(projectPaths.agentFile, "utf8")).body];
  const skills = loaded ?? (await readSkills(project.root)).skills;

  if (skills.length > 0) {
    sources.push(...skills.map((skill) => skill.source));
    parts.push(
      [
        "## Skills",
        "",
        `Call ${SKILL_TOOL_NAME} with a skill's name to read its full instructions before you use it.`,
        "",
        ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
      ].join("\n"),
    );
  }

  return {
    sources,
    content: parts.map((part) => part.trimEnd()).join("\n\n"),
  };
}
