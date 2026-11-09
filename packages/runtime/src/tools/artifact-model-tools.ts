import { ARTIFACT_TOOL_NAMES } from "@plico-ai/core";
import type { DeclaredTool, ToolDefinition } from "../types/index.js";
import { editFile, listFiles, readFile, writeFile } from "./artifact-model-tool-operations.js";
import { normalizeInputSchema } from "./schema.js";

const source = "plico:artifacts";
const maxListLimit = 1000;
const maxReadLimit = 1000;

export async function createArtifactModelTools(): Promise<DeclaredTool[]> {
  return Promise.all([
    createDeclaredTool({
      name: "list_files",
      description:
        "List artifact files in the current workspace. Optionally filter paths with a glob pattern. Results are ordered by path and paginated.",
      inputSchema: {
        type: "object",
        properties: {
          glob: { type: "string", minLength: 1, maxLength: 1024 },
          offset: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: maxListLimit },
        },
        additionalProperties: false,
      },
      capabilities: ["artifacts:read"],
      approval: { required: false },
      handler: async (input, { artifacts }) =>
        handleArtifactTool(() => listFiles(input, artifacts)),
    }),
    createDeclaredTool({
      name: "read_file",
      description:
        "Read a text artifact from the current workspace by line range. Binary artifacts return metadata only. Each response is capped at 32 KiB.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1, maxLength: 1024 },
          offset: { type: "integer", minimum: 1 },
          limit: { type: "integer", minimum: 1, maximum: maxReadLimit },
        },
        required: ["path"],
        additionalProperties: false,
      },
      capabilities: ["artifacts:read"],
      approval: { required: false },
      handler: async (input, { artifacts }) => handleArtifactTool(() => readFile(input, artifacts)),
    }),
    createDeclaredTool({
      name: "write_file",
      description:
        "Create or overwrite a text artifact in the current workspace. Writes are versioned. Content is limited to 1 MiB.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1, maxLength: 1024 },
          content: { type: "string" },
          mimeType: { type: "string", minLength: 1 },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      capabilities: ["artifacts:write"],
      approval: { required: false },
      handler: async (input, { artifacts }) =>
        handleArtifactTool(() => writeFile(input, artifacts)),
    }),
    createDeclaredTool({
      name: "edit_file",
      description:
        "Replace exact text in a text artifact. The old text must match once unless replaceAll is true. Writes are versioned.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1, maxLength: 1024 },
          old: { type: "string", minLength: 1 },
          new: { type: "string" },
          replaceAll: { type: "boolean" },
        },
        required: ["path", "old", "new"],
        additionalProperties: false,
      },
      capabilities: ["artifacts:write"],
      approval: { required: false },
      handler: async (input, { artifacts }) => handleArtifactTool(() => editFile(input, artifacts)),
    }),
  ]);
}

async function handleArtifactTool(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function createDeclaredTool(definition: ToolDefinition): Promise<DeclaredTool> {
  if (!ARTIFACT_TOOL_NAMES.includes(definition.name as (typeof ARTIFACT_TOOL_NAMES)[number]))
    throw new Error(`Unknown built-in artifact tool: ${definition.name}`);
  const schema = await normalizeInputSchema(definition.inputSchema, source, source);
  return {
    ...definition,
    source,
    inputSchema: schema.jsonSchema,
    validateInput: async (input) => {
      const result = await schema.parse(input);
      return result.success ? undefined : result.error;
    },
    parseInput: schema.parse,
  };
}
