import { validateProject } from "@plico/core";
import { pathToFileURL } from "node:url";

export async function main(argv: string[]): Promise<number> {
  const command = argv[2] ?? "help";
  const target = argv[3] ?? process.cwd();

  if (command === "validate") {
    const result = await validateProject(target);
    if (result.ok) {
      console.log(`Valid Plico project: ${target}`);
      return 0;
    }

    for (const issue of result.issues) {
      console.error(`${issue.path}: ${issue.message}`);
    }

    return 1;
  }

  console.log("Usage: plico validate [path]");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
