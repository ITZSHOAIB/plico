import type { ArtifactFileInput } from "./artifacts.js";

export type DryRunScriptStep =
  | {
      type: "assistant.output";
      content: string;
    }
  | {
      type: "tool.call";
      toolName: string;
      arguments: unknown;
      /** The output to use instead of running the tool, when the run mocks tools. */
      result?: unknown;
      /** Run the real handler even when the run mocks tools. */
      live?: true;
      /** For a `delegate_<id>` call: the steps the specialist's child run replays. */
      script?: DryRunScriptStep[];
    }
  | {
      /** In a workflow's script: the steps the next `agent(agentId)` call replays. */
      type: "agent.call";
      agentId: string;
      script: DryRunScriptStep[];
    }
  | {
      /** Decides the approval requested by the `tool.call` step just before it. */
      type: "approval.decide";
      approved: boolean;
    }
  | {
      type: "artifact.write";
      files: ArtifactFileInput[];
    };
