import {
  type DryRunScriptStep,
  normalizeScript as normalize,
  ScriptValidationError,
} from "@plico/runtime";
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

/** Reads the optional `script` of a run request, refusing it unless the server opted in. */
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
  return normalizeScript(body.script);
}
