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
