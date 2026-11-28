import { loadProject } from "./config.js";
import { type RunSelection, readTargetSchemas, resolveRunTarget } from "./run-target.js";

export type PreparedRunMessage = { ok: true; message?: string } | { ok: false; errors: string[] };

/**
 * Checks the typed `input` of a run against the selected agent's or workflow's `input` schema and returns the user message
 * the model sees. Without a schema, `content` passes through and any `input` is refused.
 */
export async function prepareRunMessage(
  root: string,
  request: { content?: string | undefined; input?: unknown },
  selection: RunSelection = {},
): Promise<PreparedRunMessage> {
  const project = await loadProject(root);
  let schema: Awaited<ReturnType<typeof readTargetSchemas>>["input"];
  try {
    schema = (await readTargetSchemas(project, await resolveRunTarget(project, selection))).input;
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }

  if (schema === undefined) {
    if (request.input !== undefined)
      return {
        ok: false,
        errors: ["This agent declares no input schema, so it does not accept input."],
      };
    return { ok: true, ...(request.content === undefined ? {} : { message: request.content }) };
  }
  if (request.input === undefined)
    return { ok: false, errors: ["input is required: this agent declares an input schema."] };

  const parsed = await schema.parse(request.input);
  if (!parsed.success) return { ok: false, errors: parsed.error.split("; ") };

  const json = JSON.stringify(request.input, null, 2);
  return {
    ok: true,
    message: request.content
      ? `${request.content}

Input:
${json}`
      : json,
  };
}
