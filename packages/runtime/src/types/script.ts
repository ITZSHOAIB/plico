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
    }
  | {
      type: "artifact.write";
      files: ArtifactFileInput[];
    };
