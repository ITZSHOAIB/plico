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
