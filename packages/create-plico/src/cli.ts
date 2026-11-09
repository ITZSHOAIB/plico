#!/usr/bin/env node
import { basename } from "node:path";
import { isDirectRun } from "./direct-run.js";
import { createInternalOpsScaffold } from "./index.js";
import { defaultScaffoldPrompts, type ScaffoldPrompts } from "./prompts.js";
import {
  isScaffoldProvider,
  PROVIDER_CHOICES,
  PROVIDER_SETUP,
  type ScaffoldProvider,
} from "./providers.js";
import { readVersion, USAGE } from "./usage.js";

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
  const args = argv.slice(2);

  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    console.log(USAGE);
    return 0;
  }

  if (args.some((arg) => arg === "--version" || arg === "-v")) {
    console.log(readVersion());
    return 0;
  }

  let providerName: string | undefined;
  const positional: string[] = [];
  const unknownOptions: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (arg === "--provider") providerName = args[++index] ?? "";
    else if (arg.startsWith("--provider=")) providerName = arg.slice("--provider=".length);
    else if (arg.startsWith("-")) unknownOptions.push(arg);
    else positional.push(arg);
  }
  const unknownOption = unknownOptions[0];
  if (unknownOption !== undefined) {
    console.error(`Unknown option: ${unknownOption}`);
    console.error(USAGE);
    return 1;
  }

  if (providerName !== undefined && !isScaffoldProvider(providerName)) {
    console.error(`Unknown provider: ${providerName}. Use ${PROVIDER_CHOICES.join(", ")}.`);
    return 1;
  }
  const provider: ScaffoldProvider | undefined = providerName as ScaffoldProvider | undefined;
  const [targetDir, projectName] = positional;

  if (targetDir) {
    try {
      await createInternalOpsScaffold({
        targetDir,
        projectName: projectName ?? deriveProjectName(targetDir),
        ...(provider ? { provider } : {}),
      });
      console.log(`Created Plico scaffold in ${targetDir}`);
      console.log(
        "Next: cd in, npm install, npm run validate. Docs: https://plico.sohab.dev (for AI agents: /llms.txt)",
      );
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

  const choice =
    provider ??
    (await prompts.select({
      message: "Which model provider?",
      options: [
        ...PROVIDER_CHOICES.map((value) => ({ value, label: PROVIDER_SETUP[value].label })),
        { value: "none", label: "None yet (dry runs only)" },
      ],
    }));
  if (prompts.isCancel(choice)) {
    prompts.cancel("Scaffold creation cancelled.");
    return 1;
  }

  const task = prompts.spinner();
  task.start("Creating scaffold...");
  try {
    await createInternalOpsScaffold({
      targetDir: promptedTargetDir,
      projectName: promptedProjectName,
      ...(typeof choice === "string" && isScaffoldProvider(choice) ? { provider: choice } : {}),
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

if (isDirectRun(import.meta.url, process.argv[1])) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
