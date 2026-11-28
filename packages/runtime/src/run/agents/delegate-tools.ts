import {
  type AgentDefinition,
  DEFAULT_MAX_DELEGATIONS,
  DELEGATE_TOOL_PREFIX,
  delegateToolName,
  normalizeInputSchema,
} from "@plico-ai/core";
import type { RunContext } from "../../engine/index.js";
import type { InMemoryEventLog } from "../../events.js";
import type { DeclaredTool } from "../../types/index.js";
import { runChild } from "./child-run.js";
import type { RunTree } from "./tree.js";
import type { AgentToolset } from "./types.js";

const taskSchema = {
  type: "object",
  properties: {
    task: {
      type: "string",
      minLength: 1,
      description:
        "Everything the specialist needs: it does not see this conversation. Reference artifacts by path.",
    },
  },
  required: ["task"],
  additionalProperties: false,
} as const;

/** One `delegate_<id>` tool. The strategies run it through the toolset, never its handler. */
async function delegateTool(specialist: AgentDefinition): Promise<DeclaredTool> {
  const schema = await normalizeInputSchema(taskSchema, specialist.source, specialist.file);
  return {
    name: delegateToolName(specialist.id),
    description: specialist.description ?? specialist.id,
    source: specialist.source,
    inputSchema: schema.jsonSchema,
    capabilities: [],
    approval: { required: false },
    validateInput: async (input) => {
      const result = await schema.parse(input);
      return result.success ? undefined : result.error;
    },
    parseInput: schema.parse,
    handler: async () => {
      throw new Error(`${delegateToolName(specialist.id)} runs as a child run.`);
    },
  };
}

/**
 * The delegate tools of `agent` and the function that runs them. Each call is a child run; its
 * result reaches the model as `{ output, structuredOutput? }` or `{ error }`. A spent
 * `maxDelegations` budget is reported to the model the same way.
 */
export async function createAgentToolset(
  ctx: RunContext,
  tree: RunTree,
  agent: AgentDefinition,
  events: InMemoryEventLog,
  scope: AgentToolset["scope"],
  artifactAccess: AgentToolset["artifactAccess"],
): Promise<AgentToolset> {
  const delegates = await Promise.all(
    agent.agents.flatMap((id) => {
      const specialist = tree.agents.get(id);
      return specialist ? [delegateTool(specialist)] : [];
    }),
  );
  const budget = agent.maxDelegations ?? DEFAULT_MAX_DELEGATIONS;
  let used = 0;
  return {
    scope,
    artifactAccess,
    delegates,
    async delegate(toolName, task, segment, script) {
      const mocked = tree.options.mockToolResult?.(toolName);
      if (mocked) return mocked.result;
      if (++used > budget)
        return {
          error: `Delegation budget reached: ${agent.id} may delegate ${budget} times per run. Answer with what you have.`,
        };
      const outcome = await runChild(ctx, tree, events, {
        segment,
        agentId: toolName.slice(DELEGATE_TOOL_PREFIX.length),
        task,
        ...(script === undefined ? {} : { script }),
      });
      if (outcome.status === "failed") return { error: outcome.error };
      return {
        output: outcome.output ?? "",
        ...(outcome.structuredOutput === undefined
          ? {}
          : { structuredOutput: outcome.structuredOutput }),
      };
    },
  };
}
