import { type EvalReport, type EventStore, listEvalReports, runEvals } from "@plico-ai/runtime";
import { HttpError } from "../errors.js";
import { jsonResponse } from "../responses.js";
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
    method: "GET",
    hostOnly: true,
    pattern: /^\/v1\/evals\/reports$/,
    handler: async ({ projectRoot }) => jsonResponse(200, await listEvalReports(projectRoot)),
  },
  {
    method: "GET",
    hostOnly: true,
    pattern: /^\/v1\/evals\/reports\/([^/]+)$/,
    handler: async ({ projectRoot, params }) => {
      const report = (await listEvalReports(projectRoot)).find((item) => item.id === params[0]);
      if (!report) throw new HttpError(404, "eval.not_found", "Unknown eval report");
      return jsonResponse(200, report);
    },
  },
  {
    method: "POST",
    hostOnly: true,
    pattern: /^\/v1\/eval$/,
    handler: async ({ projectRoot, eventStore }) => {
      // Skipped cases and scores join the wire with EvalReport version 2.
      const {
        skipped: _skipped,
        tokenCapReached: _capped,
        reportId: _reportId,
        results,
        ...summary
      } = await runEvals(projectRoot, { eventStore });
      return jsonResponse(200, {
        ...summary,
        results: results.map(
          ({ scores: _scores, trials: _trials, passAtK: _pass, ...result }) => result,
        ),
      });
    },
  },
  {
    method: "GET",
    hostOnly: true,
    pattern: /^\/v1\/eval$/,
    handler: async ({ eventStore }) => jsonResponse(200, await readLatestReport(eventStore)),
  },
  {
    method: "GET",
    hostOnly: true,
    pattern: /^\/v1\/eval\/([^/]+)$/,
    handler: async ({ eventStore, params }) => {
      const name = params[0] ?? "";
      const report = await readLatestReport(eventStore);
      const result = report.results.find((candidate) => candidate.name === name);
      if (!result) {
        throw new HttpError(404, "eval.not_found", `Unknown eval: ${name}`);
      }

      return jsonResponse(200, result);
    },
  },
];
