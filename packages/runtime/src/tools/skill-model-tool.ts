import { SKILL_TOOL_NAME, type Skill } from "@plico/core";
import type { DeclaredTool } from "../types/index.js";
import { normalizeInputSchema } from "./schema.js";

const source = "plico:skills";

/**
 * The tool that returns a skill's full text. It can only return a skill that `skills/` declared when
 * the run started, so a name never reaches outside that folder.
 */
export async function createSkillModelTool(skills: Skill[]): Promise<DeclaredTool> {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const schema = await normalizeInputSchema(
    {
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 256 } },
      required: ["name"],
      additionalProperties: false,
    },
    source,
    source,
  );
  return {
    name: SKILL_TOOL_NAME,
    description:
      "Load the full instructions of one skill from the Skills list in your instructions, by name.",
    capabilities: [],
    approval: { required: false },
    source,
    inputSchema: schema.jsonSchema,
    validateInput: async (input) => {
      const result = await schema.parse(input);
      return result.success ? undefined : result.error;
    },
    parseInput: schema.parse,
    handler: async (input) => {
      const name = (input as { name: string }).name;
      const skill = byName.get(name);
      if (!skill)
        return {
          error: `Unknown skill: ${name}. Available skills: ${[...byName.keys()].join(", ")}.`,
        };
      return { name: skill.name, content: skill.body };
    },
  };
}
