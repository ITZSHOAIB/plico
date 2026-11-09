import { type LoadedProject, readSkills, type Skill } from "@plico/core";
import type { InMemoryEventLog } from "../events.js";
import { composeInstructions } from "../instructions.js";

/**
 * Records the instructions and skills a run starts with. A run that resumes reuses what it
 * recorded, so editing `agent.md` or a skill while it waits does not change its behaviour.
 */
export async function pinInstructions(
  project: LoadedProject,
  events: InMemoryEventLog,
): Promise<{ instructions: { content: string }; skills: Skill[] }> {
  const recorded = events.all().find((event) => event.type === "instructions.composed");
  if (recorded?.type === "instructions.composed") {
    await events.append("instructions.composed", recorded.payload);
    // Runs recorded before skills were pinned fall back to the skills on disk.
    const skills = recorded.payload.skills ?? (await readSkills(project.root)).skills;
    return { instructions: { content: recorded.payload.content }, skills };
  }
  const { skills } = await readSkills(project.root);
  const instructions = await composeInstructions(project, skills);
  await events.append("instructions.composed", {
    length: instructions.content.length,
    sources: instructions.sources,
    content: instructions.content,
    skills: skills.map(({ name, description, source, body }) => ({
      name,
      description,
      source,
      body,
    })),
  });
  return { instructions, skills };
}
