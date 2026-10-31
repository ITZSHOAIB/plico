import { type EvalReport, type EventStore, runEvals } from "@plico/runtime";
import { HttpError } from "../errors.js";
import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

async function readLatestReport(eventStore: EventStore): Promise<EvalReport> {
  const report = await eventStore.getLatestEvalReport();
  if (!report) {
    throw new HttpError(404, "eval.not_found", "No eval results yet. Run evals first.");
  }

  return report;
}

export const evalRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/eval$/,
    handler: async ({ projectRoot, eventStore, response }) => {
      sendJson(response, 200, await runEvals(projectRoot, { eventStore }));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/eval$/,
    handler: async ({ eventStore, response }) => {
      sendJson(response, 200, await readLatestReport(eventStore));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/eval\/([^/]+)$/,
    handler: async ({ eventStore, response, params }) => {
      const name = params[0] ?? "";
      const report = await readLatestReport(eventStore);
      const result = report.results.find((candidate) => candidate.name === name);
      if (!result) {
        throw new HttpError(404, "eval.not_found", `Unknown eval: ${name}`);
      }

      sendJson(response, 200, result);
    },
  },
];
