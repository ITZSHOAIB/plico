import type { DryRunScriptStep } from "@plico/runtime";
import { HttpError } from "./errors.js";

export function normalizeScript(value: unknown): DryRunScriptStep[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "request.invalid_body", "script must be an array.");
  }

  return value.map((step, index) => normalizeScriptStep(step, index));
}

function normalizeScriptStep(step: unknown, index: number): DryRunScriptStep {
  if (!isRecord(step) || typeof step.type !== "string") {
    throw new HttpError(
      400,
      "request.invalid_body",
      `script step ${index + 1} must include a type.`,
    );
  }

  if (step.type === "assistant.output") {
    if (typeof step.content !== "string") {
      throw new HttpError(
        400,
        "request.invalid_body",
        `script step ${index + 1} must include content.`,
      );
    }

    return {
      type: "assistant.output",
      content: step.content,
    };
  }

  if (step.type === "tool.call") {
    if (typeof step.toolName !== "string") {
      throw new HttpError(
        400,
        "request.invalid_body",
        `script step ${index + 1} must include a toolName.`,
      );
    }

    return {
      type: "tool.call",
      toolName: step.toolName,
      arguments: step.arguments,
    };
  }

  throw new HttpError(
    400,
    "request.invalid_body",
    `script step ${index + 1} has an unsupported type.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
