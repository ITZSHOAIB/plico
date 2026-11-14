import { readFile } from "node:fs/promises";
import { type ParsedArgs, readStringOption } from "../args.js";

/** The typed run input from `--input <json>` or `--input-file <path>`, if either is given. */
export async function readRunInput(parsed: ParsedArgs): Promise<unknown> {
  const inline = readStringOption(parsed, "--input");
  const file = readStringOption(parsed, "--input-file");
  if (inline !== undefined && file !== undefined)
    throw new Error("Use either --input or --input-file, not both.");
  if (inline === undefined && file === undefined) return undefined;
  const source = file === undefined ? "--input" : file;
  try {
    return JSON.parse(file === undefined ? (inline ?? "") : await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(
      `${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
