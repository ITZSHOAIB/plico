import type { ArtifactFileInput, DryRunScriptStep } from "./types/index.js";

export class ScriptValidationError extends Error {}

export function normalizeScript(value: unknown): DryRunScriptStep[] {
  if (!Array.isArray(value)) throw new ScriptValidationError("script must be an array.");
  return value.map(normalizeStep);
}

function normalizeStep(step: unknown, index: number): DryRunScriptStep {
  const prefix = `script step ${index + 1}`;
  if (!isRecord(step) || typeof step.type !== "string") {
    throw new ScriptValidationError(`${prefix} must include a type.`);
  }
  if (step.type === "assistant.output") {
    if (typeof step.content !== "string") {
      throw new ScriptValidationError(`${prefix} must include content.`);
    }
    return { type: "assistant.output", content: step.content };
  }
  if (step.type === "tool.call") {
    if (typeof step.toolName !== "string") {
      throw new ScriptValidationError(`${prefix} must include a toolName.`);
    }
    return { type: "tool.call", toolName: step.toolName, arguments: step.arguments };
  }
  if (step.type === "artifact.write") {
    if (!Array.isArray(step.files)) {
      throw new ScriptValidationError(`${prefix} must include a files array.`);
    }
    const files: ArtifactFileInput[] = step.files.map((file: unknown, fileIndex: number) => {
      if (!isRecord(file) || typeof file.path !== "string" || typeof file.content !== "string") {
        throw new ScriptValidationError(
          `${prefix} file ${fileIndex + 1} must have path and content strings.`,
        );
      }
      return {
        path: file.path,
        content: file.content,
        ...(typeof file.mimeType === "string" ? { mimeType: file.mimeType } : {}),
      };
    });
    return { type: "artifact.write", files };
  }
  throw new ScriptValidationError(`${prefix} has an unsupported type.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
