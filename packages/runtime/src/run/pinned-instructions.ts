import type { JsonSchema, ValidationIssue } from "@plico-ai/contracts";
import { type LoadedProject, readSkills, type Skill } from "@plico-ai/core";
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
  const { skills } = await readSkills(project.root);
  const instructions = await composeInstructions(project, skills);
  const outputSchema = await readOutputSchema(project);
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

/**
 * A run that already recorded its instructions and skills does not read them again, so an
 * `agent.md` or skill that is invalid now must not stop it from resuming.
 */
export function ignoredWhenPinned(issue: ValidationIssue): boolean {
  return issue.path === "agent.md" || issue.path === "skills" || issue.path.startsWith("skills/");
}
