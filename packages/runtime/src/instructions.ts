import { readFile } from "node:fs/promises";
import {
  type AgentDefinition,
  getProjectPaths,
  getProjectRelativePaths,
  type LoadedProject,
  parseAgentFile,
  readSkills,
  SKILL_TOOL_NAME,
  type Skill,
} from "@plico-ai/core";
import type { ComposedInstructions } from "./types/index.js";

/**
 * The agent's instructions plus a list of skills. A skill's full text loads on demand. Without
 * `agent`, this is root `agent.md`.
 */
export async function composeInstructions(
  project: LoadedProject,
  loaded?: Skill[],
  agent?: Pick<AgentDefinition, "source" | "instructions">,
): Promise<ComposedInstructions> {
  const projectPaths = getProjectPaths(project.root);
  const sources = [agent?.source ?? getProjectRelativePaths().agentFile];
  const parts = [
    agent?.instructions ?? parseAgentFile(await readFile(projectPaths.agentFile, "utf8")).body,
  ];
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
