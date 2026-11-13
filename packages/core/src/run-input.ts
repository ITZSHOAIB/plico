import { readFile } from "node:fs/promises";
import { parseAgentFile } from "./agent-file.js";
import { loadProject } from "./config.js";
import { getProjectPaths } from "./layout.js";
import { normalizeInputSchema } from "./schema.js";

export type PreparedRunMessage = { ok: true; message?: string } | { ok: false; errors: string[] };

/**
 * Checks the typed `input` of a run against the agent's `input` schema and returns the user message
 * the model sees. Without a schema, `content` passes through and any `input` is refused.
 */
export async function prepareRunMessage(
  root: string,
  request: { content?: string | undefined; input?: unknown },
): Promise<PreparedRunMessage> {
  const { config } = await loadProject(root);
  const { agentFile } = getProjectPaths(root);
  const frontmatter = parseAgentFile(await readFile(agentFile, "utf8")).data;
  const declared = frontmatter.input ?? config.input;

  if (declared === undefined) {
    if (request.input !== undefined)
      return {
        ok: false,
        errors: ["This agent declares no input schema, so it does not accept input."],
      };
    return { ok: true, ...(request.content === undefined ? {} : { message: request.content }) };
  }
  if (request.input === undefined)
    return { ok: false, errors: ["input is required: this agent declares an input schema."] };

  const schema = await normalizeInputSchema(declared, "input", agentFile);
  const parsed = await schema.parse(request.input);
  if (!parsed.success) return { ok: false, errors: parsed.error.split("; ") };

  const json = JSON.stringify(request.input, null, 2);
  return { ok: true, message: request.content ? `${request.content}\n\nInput:\n${json}` : json };
}
