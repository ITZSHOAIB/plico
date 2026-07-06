import { access, constants, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, validateProject } from "@plico/core";
import { discoverToolFiles, loadToolFile } from "./tools.js";
import type { ReadinessDiagnostic, ReadinessOptions, ReadinessReport } from "./types.js";

function diag(
  severity: ReadinessDiagnostic["severity"],
  subsystem: string,
  message: string,
  path?: string,
): ReadinessDiagnostic {
  const result: ReadinessDiagnostic = { severity, subsystem, message };
  if (path !== undefined) {
    result.path = path;
  }
  return result;
}

export async function checkReadiness(
  projectRoot: string,
  options: ReadinessOptions = {},
): Promise<ReadinessReport> {
  const diagnostics: ReadinessDiagnostic[] = [];

  // 1. Project validation
  const validation = await validateProject(projectRoot);
  if (!validation.ok || !validation.project) {
    if (validation.errors?.length) {
      for (const issue of validation.errors) {
        diagnostics.push(diag("error", "project.structure", issue.message, issue.path));
      }
    }
    if (validation.warnings?.length) {
      for (const issue of validation.warnings) {
        diagnostics.push(diag("warning", "project.structure", issue.message, issue.path));
      }
    }
    if (!validation.project) {
      return finalize(projectRoot, diagnostics);
    }
  } else {
    diagnostics.push(diag("ok", "project.structure", "Project is valid", "plico.config.ts"));
    if (validation.warnings?.length) {
      for (const issue of validation.warnings) {
        diagnostics.push(diag("warning", "project.structure", issue.message, issue.path));
      }
    }
  }

  const project = validation.project;
  if (!project) {
    return finalize(projectRoot, diagnostics);
  }

  // 2. Tools discovery and schema validation
  {
    const projectPaths = getProjectPaths(project.root);
    const relativePaths = getProjectRelativePaths();
    const toolFiles = await discoverToolFiles(project);

    if (toolFiles.length === 0) {
      diagnostics.push(
        diag(
          "warning",
          "tools.discovery",
          "No tools declared. Add a .tool.ts module to get started.",
        ),
      );
    } else {
      let validCount = 0;
      for (const entry of toolFiles) {
        const source = `${relativePaths.directories.tools}/${entry}`;
        try {
          await loadToolFile(join(projectPaths.directories.tools, entry), source);
          validCount++;
        } catch (error) {
          diagnostics.push(
            diag(
              "error",
              "tools.discovery",
              `Schema validation failed for ${entry}: ${String(error)}`,
              source,
            ),
          );
        }
      }
      diagnostics.push(
        diag(
          validCount === toolFiles.length ? "ok" : "warning",
          "tools.discovery",
          `${validCount}/${toolFiles.length} tool(s) valid`,
        ),
      );
    }
  }

  // 3. Eval fixtures
  const evalsDir = join(projectRoot, "evals");
  try {
    const entries = await readdir(evalsDir);
    const scriptFiles = entries.filter((e) => e.endsWith(".script.json"));
    if (scriptFiles.length === 0) {
      diagnostics.push(
        diag(
          "warning",
          "evals.fixtures",
          "No .script.json eval fixtures found. Add evals to track behavior.",
        ),
      );
    } else {
      diagnostics.push(diag("ok", "evals.fixtures", `${scriptFiles.length} eval fixture(s) found`));
    }

    // Recent eval results via eventStore
    if (options.eventStore) {
      const runs = await options.eventStore.listRuns();
      const evalRuns = runs.filter((r) => r.runId.startsWith("eval-"));
      if (evalRuns.length === 0) {
        diagnostics.push(
          diag(
            "warning",
            "evals.results",
            "No eval runs have been executed. Run plico eval to see results.",
          ),
        );
      } else {
        const sorted = [...evalRuns].sort(
          (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime(),
        );
        const lastEval = sorted[0];
        const passed = evalRuns.filter((r) => r.status === "completed").length;
        diagnostics.push(
          diag(
            "ok",
            "evals.results",
            `${evalRuns.length} eval run(s), ${passed} passed (last: ${lastEval?.runId ?? "none"})`,
          ),
        );
      }
    }
  } catch {
    diagnostics.push(
      diag(
        "warning",
        "evals.fixtures",
        "evals/ directory not found. Create evals/ to add eval fixtures.",
      ),
    );
  }

  // 4. Persistence
  const dbPath = options.databasePath ?? join(projectRoot, ".plico", "plico.sqlite");
  try {
    await access(dbPath, constants.F_OK);
    diagnostics.push(diag("ok", "persistence.storage", "Database is readable", dbPath));
  } catch {
    try {
      const dbDir = join(projectRoot, ".plico");
      await mkdir(dbDir, { recursive: true });
      const probe = join(dbDir, ".probe");
      await writeFile(probe, "");
      await access(probe, constants.F_OK);
      diagnostics.push(
        diag(
          "warning",
          "persistence.storage",
          "Database file does not exist yet but .plico/ is writable. Run plico run --dry --persist to initialize.",
          dbPath,
        ),
      );
    } catch {
      diagnostics.push(
        diag("error", "persistence.storage", "Persistence path is not writable", dbPath),
      );
    }
  }

  // 5. Artifact workspace
  const artifactsDir = join(projectRoot, "artifacts");
  try {
    await access(artifactsDir, constants.F_OK);
    diagnostics.push(
      diag("ok", "artifacts.workspace", "Artifact workspace directory exists", "artifacts/"),
    );
  } catch {
    diagnostics.push(
      diag(
        "warning",
        "artifacts.workspace",
        "artifacts/ directory not found. Create it to store generated outputs.",
      ),
    );
  }

  // 6. Server/Studio config
  try {
    const { loadProject } = await import("@plico/core");
    await loadProject(projectRoot);
    diagnostics.push(diag("ok", "server.config", "Project config loads successfully for server"));
  } catch {
    diagnostics.push(
      diag(
        "warning",
        "server.config",
        "plico.config.ts could not be loaded. Server may not start.",
      ),
    );
  }

  return finalize(projectRoot, diagnostics);
}

function finalize(projectRoot: string, diagnostics: ReadinessDiagnostic[]): ReadinessReport {
  const okCount = diagnostics.filter((d) => d.severity === "ok").length;
  const warnCount = diagnostics.filter((d) => d.severity === "warning").length;
  const errCount = diagnostics.filter((d) => d.severity === "error").length;

  return {
    projectRoot,
    timestamp: new Date().toISOString(),
    diagnostics,
    summary: { ok: okCount, warning: warnCount, error: errCount },
  };
}
