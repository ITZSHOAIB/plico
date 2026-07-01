import { type LoadedProject, validateProject } from "@plico/core";
import { HttpError } from "./errors.js";

export async function loadProjectOrThrow(projectRoot: string): Promise<LoadedProject> {
  const validation = await validateProject(projectRoot);
  if (!validation.ok || !validation.project) {
    const message = validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new HttpError(400, "project.invalid", message || "Invalid project.");
  }

  return validation.project;
}
