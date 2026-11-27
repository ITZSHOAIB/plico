import type { JsonSchema, ValidationIssue } from "@plico-ai/contracts";
import {
  type AgentDefinition,
  type LoadedProject,
  MAIN_AGENT_ID,
  normalizeInputSchema,
  readSkills,
  type Skill,
} from "@plico-ai/core";
import type { InMemoryEventLog } from "../events.js";
import { composeInstructions } from "../instructions.js";
import { readOutputSchema } from "../output-schema.js";

/**
 * Records the instructions and skills a run starts with. A run that resumes reuses what it
 * recorded, so editing `agent.md` or a skill while it waits does not change its behaviour.
 */
export async function pinInstructions(
  project: LoadedProject,
  events: InMemoryEventLog,
  agent?: AgentDefinition,
  outputOverride?: JsonSchema,
): Promise<{ instructions: { content: string }; skills: Skill[]; outputSchema?: JsonSchema }> {
  const recorded = events.all().find((event) => event.type === "instructions.composed");
  if (recorded?.type === "instructions.composed") {
    await events.append("instructions.composed", recorded.payload);
    // Runs recorded before skills were pinned fall back to the skills on disk.
    const skills = recorded.payload.skills ?? (await readSkills(project.root)).skills;
    return {
      instructions: { content: recorded.payload.content },
      skills,
      ...(recorded.payload.outputSchema === undefined
        ? {}
        : { outputSchema: recorded.payload.outputSchema }),
    };
  }
  const all = (await readSkills(project.root)).skills;
  const skills = agent?.skills ? all.filter((skill) => agent.skills?.includes(skill.name)) : all;
  const instructions = await composeInstructions(project, skills, agent);
  const outputSchema = outputOverride ?? (await agentOutputSchema(project, agent));
  await events.append("instructions.composed", {
    length: instructions.content.length,
    sources: instructions.sources,
    content: instructions.content,
    ...(outputSchema === undefined ? {} : { outputSchema }),
    skills: skills.map(({ name, description, source, body }) => ({
      name,
      description,
      source,
      body,
    })),
  });
  return { instructions, skills, ...(outputSchema === undefined ? {} : { outputSchema }) };
}

async function agentOutputSchema(
  project: LoadedProject,
  agent: AgentDefinition | undefined,
): Promise<JsonSchema | undefined> {
  if (!agent || agent.id === MAIN_AGENT_ID) return readOutputSchema(project);
  if (agent.output === undefined) return undefined;
  return (await normalizeInputSchema(agent.output, "output", agent.file)).jsonSchema;
}

/**
 * A run that already recorded its instructions and skills does not read them again, so an
 * `agent.md` or skill that is invalid now must not stop it from resuming.
 */
export function ignoredWhenPinned(issue: ValidationIssue): boolean {
  return (
    issue.path === "agent.md" ||
    issue.path === "skills" ||
    issue.path.startsWith("skills/") ||
    issue.path.startsWith("agents/")
  );
}
