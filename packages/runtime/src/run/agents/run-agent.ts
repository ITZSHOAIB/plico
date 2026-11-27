import type { Span } from "@opentelemetry/api";
import type { JsonSchema, RunResult } from "@plico-ai/contracts";
import { type AgentDefinition, resolveAgentArtifacts } from "@plico-ai/core";
import type { RunContext } from "../../engine/index.js";
import type { InMemoryEventLog } from "../../events.js";
import { discoverRunTools } from "../../mcp/run-tools.js";
import type { DeclaredTool, DryRunScriptStep, RunProjectOptions } from "../../types/index.js";
import { pinInstructions } from "../pinned-instructions.js";
import { recordTools } from "../record-tools.js";
import { runDryStrategy } from "../strategies/dry.js";
import { runProviderBackedRun } from "../strategies/provider.js";
import { tracedContext } from "../tracing.js";
import { createAgentToolset } from "./delegate-tools.js";
import { agentModel, type RunTree, treeScope } from "./tree.js";

export interface AgentRequest {
  message?: string | undefined;
  history?: RunProjectOptions["history"];
  script?: DryRunScriptStep[] | undefined;
  /** A workflow call's `output`, which replaces the agent's own. */
  outputSchema?: JsonSchema;
}

/**
 * One agent's ReAct loop on `events`: its pinned instructions and skills, the project tools it may
 * call, its delegate tools, and its model. `ctx` is untraced; delegations build on it.
 */
export async function executeAgent(
  ctx: RunContext,
  span: Span,
  tree: RunTree,
  agent: AgentDefinition,
  events: InMemoryEventLog,
  request: AgentRequest,
): Promise<Pick<RunResult, "output" | "structuredOutput">> {
  const { project, options } = tree;
  const { model, provider } = agentModel(tree, agent);
  const traced = tracedContext(ctx, span, model);
  const { instructions, skills, outputSchema } = await pinInstructions(
    project,
    events,
    agent,
    request.outputSchema,
  );

  const discovered = await discoverRunTools(
    project,
    traced.signal,
    request.script ?? (provider ? undefined : []),
    events,
    tree.input.mockTools,
  );
  const tools = withMockedResults(
    agent.tools ? discovered.filter((tool) => agent.tools?.includes(tool.name)) : discovered,
    options.mockToolResult,
  );
  await recordTools(project.root, tools, events, project.config);
  const toolset = await createAgentToolset(
    ctx,
    tree,
    agent,
    events,
    treeScope(tree),
    resolveAgentArtifacts(project.config.artifacts?.access ?? "read-write", agent.artifacts),
  );

  return provider !== undefined
    ? runProviderBackedRun(
        traced,
        provider,
        request.message,
        instructions.content,
        tools,
        events,
        options.eventStore,
        model,
        project.config,
        request.history,
        skills,
        outputSchema,
        toolset,
      )
    : runDryStrategy(
        traced,
        project,
        tools,
        events,
        options.eventStore,
        request.script,
        tree.input.mockTools === true,
        outputSchema,
        toolset,
      );
}

function withMockedResults(
  tools: DeclaredTool[],
  mock: RunProjectOptions["mockToolResult"],
): DeclaredTool[] {
  if (!mock) return tools;
  return tools.map((tool) => ({
    ...tool,
    handler: async (input, context) => {
      const mocked = mock(tool.name);
      return mocked ? mocked.result : tool.handler(input, context);
    },
  }));
}
