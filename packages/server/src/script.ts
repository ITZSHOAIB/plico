import { DELEGATE_TOOL_PREFIX } from "@plico-ai/core";
import {
  type DryRunScriptStep,
  normalizeScript as normalize,
  ScriptValidationError,
} from "@plico-ai/runtime";
import { HttpError } from "./errors.js";

export function normalizeScript(value: unknown): DryRunScriptStep[] {
  try {
    return normalize(value);
  } catch (error) {
    if (error instanceof ScriptValidationError) {
      throw new HttpError(400, "request.invalid_body", error.message);
    }
    throw error;
  }
}

/**
 * Reads the optional `script` of a run request, refusing it unless the server opted in. Scripted
 * runs over HTTP never run tool handlers: each tool step must carry its `result`, and `live` steps
 * are refused.
 */
export function readScript(
  body: Record<string, unknown>,
  allowScript: boolean,
): DryRunScriptStep[] | undefined {
  if (body.script === undefined) return undefined;
  if (!allowScript) {
    throw new HttpError(
      403,
      "run.script_disabled",
      "Scripted runs are disabled on this server. Start it with allowScript to enable them.",
    );
  }
  const script = normalizeScript(body.script);
  refuseHandlers(script, "");
  return script;
}

/**
 * Checks every step, including those a delegation or workflow agent call replays. A `delegate_<id>`
 * call with a nested `script` runs that specialist instead of a handler, so it needs no `result`.
 */
function refuseHandlers(script: DryRunScriptStep[], path: string): void {
  for (const [index, step] of script.entries()) {
    const at = `${path}${index}`;
    if (step.type === "agent.call") {
      refuseHandlers(step.script, `${at}.`);
      continue;
    }
    if (step.type !== "tool.call") continue;
    if (step.live === true)
      throw new HttpError(
        400,
        "request.invalid_body",
        `Script step ${at} is live. Scripted runs over HTTP never run tool handlers; give the step a "result" instead.`,
      );
    if (step.script !== undefined && step.toolName.startsWith(DELEGATE_TOOL_PREFIX)) {
      refuseHandlers(step.script, `${at}.`);
      continue;
    }
    if (!("result" in step))
      throw new HttpError(
        400,
        "request.invalid_body",
        `Script step ${at} has no "result". Scripted runs over HTTP never run tool handlers; add the "result" the tool should return.`,
      );
  }
}
