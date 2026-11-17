import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalReportV2 } from "@plico-ai/contracts";
import type { EvalRunSummary } from "../types/index.js";
import { digestEvalFixtures } from "./discover.js";

export async function saveEvalReport(
  root: string,
  mode: "scripted" | "live",
  summary: EvalRunSummary,
): Promise<EvalReportV2> {
  const id = crypto.randomUUID();
  const { reportId: _id, ...data } = summary;
  const report: EvalReportV2 = {
    ...data,
    schemaVersion: 2,
    id,
    mode,
    evaluatedAt: new Date().toISOString(),
    fixturesDigest: await digestEvalFixtures(join(root, "evals")),
  };
  const dir = join(root, ".plico", "evals");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

class UnsupportedReportVersionError extends Error {}

export async function readEvalReport(file: string): Promise<EvalReportV2> {
  const report = JSON.parse(await readFile(file, "utf8")) as EvalReportV2;
  if (report && report.schemaVersion !== 2)
    throw new UnsupportedReportVersionError(`Unsupported eval report version: ${file}`);
  if (
    !report ||
    typeof report.id !== "string" ||
    !Array.isArray(report.results) ||
    !["live", "scripted"].includes(report.mode)
  )
    throw new Error(`Invalid eval report: ${file}`);
  return report;
}

export async function listEvalReports(root: string): Promise<EvalReportV2[]> {
  const dir = join(root, ".plico", "evals");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const loaded = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          return await readEvalReport(join(dir, file));
        } catch (error) {
          if (error instanceof UnsupportedReportVersionError) return undefined;
          throw error;
        }
      }),
  );
  const reports = loaded.filter((report) => report !== undefined);
  return reports.sort(
    (a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt) || a.id.localeCompare(b.id),
  );
}
