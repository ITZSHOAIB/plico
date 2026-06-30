import { createInternalOpsScaffold } from "./index.js";
import { pathToFileURL } from "node:url";

export async function main(argv: string[]): Promise<number> {
  const targetDir = argv[2] ?? process.cwd();
  await createInternalOpsScaffold({ targetDir });
  console.log(`Created Plico scaffold in ${targetDir}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
