import { readFile } from "node:fs/promises";
import type { DryRunScriptStep } from "@plico/runtime";
import { errorMessage } from "./errors.js";

export async function loadDryRunScript(scriptPath: string): Promise<DryRunScriptStep[]> {
  try {
    const raw = await readFile(scriptPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("Dry run script must be a JSON array of steps.");
    }

    return parsed.map((step, index) => normalizeScriptStep(step, index, scriptPath));
  } catch (error) {
    throw new Error(`Unable to parse dry run script ${scriptPath}: ${errorMessage(error)}`);
  }
}

function normalizeScriptStep(step: unknown, index: number, scriptPath: string): DryRunScriptStep {
  if (!isRecord(step) || typeof step.type !== "string") {
    throw new Error(`Script step ${index + 1} in ${scriptPath} must be an object with a type.`);
  }

  if (step.type === "assistant.output") {
    if (typeof step.content !== "string") {
      throw new Error(`Script step ${index + 1} in ${scriptPath} must include string content.`);
    }

    return {
      type: "assistant.output",
      content: step.content,
    };
  }

  if (step.type === "tool.call") {
    if (typeof step.toolName !== "string") {
      throw new Error(`Script step ${index + 1} in ${scriptPath} must include a toolName string.`);
    }

    return {
      type: "tool.call",
      toolName: step.toolName,
      arguments: step.arguments,
    };
  }

  throw new Error(
    `Script step ${index + 1} in ${scriptPath} has an unsupported type: ${step.type}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
