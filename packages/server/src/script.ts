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
  const live = script.findIndex((step) => step.type === "tool.call" && step.live === true);
  if (live !== -1) {
    throw new HttpError(
      400,
      "request.invalid_body",
      `Script step ${live} is live. Scripted runs over HTTP never run tool handlers; give the step a "result" instead.`,
    );
  }
  const unmocked = script.findIndex((step) => step.type === "tool.call" && !("result" in step));
  if (unmocked !== -1) {
    throw new HttpError(
      400,
      "request.invalid_body",
      `Script step ${unmocked} has no "result". Scripted runs over HTTP never run tool handlers; add the "result" the tool should return.`,
    );
  }
  return script;
}
