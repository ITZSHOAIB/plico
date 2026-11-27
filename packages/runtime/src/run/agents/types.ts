import type { JsonValue, PlicoEvent } from "@plico-ai/contracts";
import type { ArtifactAccess } from "@plico-ai/core";
import type { DeclaredTool, DryRunScriptStep } from "../../types/index.js";

/** What a tool handler sees of the run tree: one workspace and one host context for every agent. */
export interface ToolScope {
  /** Names the workspace when there is no thread: the root run's ID. */
  workspaceRunId: string;
  threadId?: string | undefined;
  context?: Record<string, JsonValue> | undefined;
  /** Artifact history so far: earlier thread runs, then every run in this tree in order. */
  history(): Promise<PlicoEvent[]>;
}

/** The parts of one agent's toolset that depend on where it runs in the tree. */
export interface AgentToolset {
  scope: ToolScope;
  artifactAccess: ArtifactAccess;
  /** Synthetic `delegate_<id>` tools, shown to the model after the project tools. */
  delegates: DeclaredTool[];
  /**
   * Runs the specialist behind a delegate tool as a child run and returns the tool result.
   * `segment` names the child under its parent, such as `d0-1`.
   */
  delegate(
    toolName: string,
    task: string,
    segment: string,
    script?: DryRunScriptStep[],
  ): Promise<unknown>;
}
