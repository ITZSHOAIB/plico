import { basename } from "node:path";
import { createInternalOpsScaffold } from "./index.js";
import { defaultScaffoldPrompts, type ScaffoldPrompts } from "./prompts.js";
import { pathToFileURL } from "node:url";

function deriveProjectName(targetDir: string): string {
  const baseName = basename(targetDir).trim();

  if (!baseName || baseName === "." || baseName === "/") {
    return "Internal Ops Agent";
  }

  return baseName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function promptForText(
  prompts: ScaffoldPrompts,
  options: Parameters<ScaffoldPrompts["text"]>[0],
): Promise<string | null> {
  const value = await prompts.text(options);

  if (prompts.isCancel(value)) {
    prompts.cancel("Scaffold creation cancelled.");
    return null;
  }

  return String(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function main(
  argv: string[],
  prompts: ScaffoldPrompts = defaultScaffoldPrompts,
): Promise<number> {
  const targetDir = argv[2];
  const projectName = argv[3];

  if (targetDir) {
    try {
      await createInternalOpsScaffold({
        targetDir,
        projectName: projectName ?? "Internal Ops Agent",
      });
      console.log(`Created Plico scaffold in ${targetDir}`);
      return 0;
    } catch (error) {
      console.error(formatError(error));
      return 1;
    }
  }

  prompts.intro("Create a Plico scaffold");

  const promptedTargetDir = await promptForText(prompts, {
    message: "Where should I create it?",
    placeholder: "my-plico",
    defaultValue: "my-plico",
  });
  if (promptedTargetDir === null) {
    return 1;
  }

  const promptedProjectName = await promptForText(prompts, {
    message: "Project name?",
    defaultValue: deriveProjectName(promptedTargetDir),
  });
  if (promptedProjectName === null) {
    return 1;
  }

  const task = prompts.spinner();
  task.start("Creating scaffold...");
  try {
    await createInternalOpsScaffold({
      targetDir: promptedTargetDir,
      projectName: promptedProjectName,
    });
    task.stop(`Created scaffold in ${promptedTargetDir}`);
    prompts.outro(`Generated ${promptedProjectName}`);
    return 0;
  } catch (error) {
    task.stop("Scaffold creation failed.");
    prompts.cancel(formatError(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
