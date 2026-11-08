import type { ArtifactFileMetadata } from "./artifacts.js";
import type { JsonValue } from "./events.js";

export interface ToolArtifactFile {
  path: string;
  content: string | Uint8Array;
  mimeType: string;
  version: number;
  contentHash: string;
}

export interface ToolArtifactContext {
  read(path: string): Promise<ToolArtifactFile | undefined>;
  write(
    path: string,
    content: string | Uint8Array,
    options?: { mimeType?: string },
  ): Promise<{ path: string; version: number }>;
  list(): Promise<ArtifactFileMetadata[]>;
}

export interface JsonSchemaObject {
  [keyword: string]: JsonValue | undefined;
}

export type JsonSchema = JsonSchemaObject | boolean;

export interface ZodInputSchema {
  safeParseAsync(input: unknown): Promise<ZodInputParseResult>;
}

export type ZodInputParseResult =
  | { success: true; data: unknown }
  | {
      success: false;
      error: { issues: Array<{ path: Array<string | number | symbol>; message: string }> };
    };

export type ToolInputSchema = JsonSchema | ZodInputSchema;

export interface ToolApprovalPolicy {
  required: boolean;
  reason?: string;
}

export interface ToolHandlerContext {
  /** Aborts when the run is cancelled. Pass it to fetch or a child process to stop early. */
  signal: AbortSignal;
  /**
   * Names this tool call and stays the same if the call runs again after a crash. Pass it to
   * an API that accepts an idempotency key so a repeat does not act twice.
   */
  idempotencyKey: string;
  artifacts: ToolArtifactContext;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: unknown, context: ToolHandlerContext) => unknown | Promise<unknown>;
}
