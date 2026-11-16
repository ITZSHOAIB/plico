import type { AgentSchemas } from "@plico-ai/contracts";
import { readRunSchemas } from "@plico-ai/core";
import { loadProjectOrThrow } from "../project.js";
import { jsonResponse } from "../responses.js";
import type { Route } from "./types.js";

// Not host-only: clients of a scoped mount send typed input and read typed results too.
export const schemaRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/schemas$/,
    handler: async ({ projectRoot }) => {
      const schemas = await readRunSchemas(await loadProjectOrThrow(projectRoot));
      const body: AgentSchemas = {
        ...(schemas.input ? { input: schemas.input.jsonSchema } : {}),
        ...(schemas.output ? { output: schemas.output.jsonSchema } : {}),
      };
      return jsonResponse(200, body);
    },
  },
];
