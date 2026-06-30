import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { type LoadedProject, type ValidationIssue, validateProject } from "@plico/core";

export type RunStatus = "completed" | "failed" | "blocked";

export type PlicoEventType =
  | "run.started"
  | "instructions.composed"
  | "tools.discovered"
  | "assistant.output"
  | "tool.call"
  | "tool.result"
  | "approval.required"
  | "run.completed"
  | "run.blocked"
  | "run.failed"
  | "run.error";

export interface PlicoEvent {
  schemaVersion: 1;
  runId: string;
  id: string;
  sequence: number;
  timestamp: string;
  type: PlicoEventType;
  payload: Record<string, unknown>;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  events: PlicoEvent[];
  errors?: ValidationIssue[];
}

export type DryRunScriptStep =
  | {
      type: "assistant.output";
      content: string;
    }
  | {
      type: "tool.call";
      toolName: string;
      arguments: unknown;
    };

export interface RunProjectOptions {
  script?: DryRunScriptStep[];
}

export interface JsonSchemaSubset {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  properties?: Record<string, JsonSchemaSubset>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaSubset;
}

export interface ToolApprovalPolicy {
  required: boolean;
  reason?: string;
}

export interface DeclaredTool {
  source: string;
  name: string;
  description: string;
  inputSchema: JsonSchemaSubset;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: unknown) => unknown | Promise<unknown>;
}

export async function runProject(
  root: string,
  options: RunProjectOptions = {},
): Promise<RunResult> {
  const validation = await validateProject(root);
  const runId = "run-0001";
  const events = new InMemoryEventLog(runId);

  if (!validation.ok || !validation.project) {
    events.append("run.error", {
      phase: "validation",
      issues: validation.errors,
    });
    events.append("run.failed", {
      phase: "validation",
      status: "failed",
    });

    return {
      runId,
      status: "failed",
      events: events.all(),
      errors: validation.errors,
    };
  }

  events.append("run.started", {
    projectRoot: validation.project.root,
    projectName: validation.project.config.name,
  });

  try {
    const instructions = await composeInstructions(validation.project);
    events.append("instructions.composed", {
      length: instructions.content.length,
      sources: instructions.sources,
      content: instructions.content,
    });

    const tools = await discoverTools(validation.project);
    events.append("tools.discovered", {
      tools: tools.map((tool) => ({
        source: tool.source,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        capabilities: tool.capabilities,
        approval: tool.approval,
      })),
    });

    const output =
      options.script === undefined
        ? await runDefaultDryRun(validation.project, events)
        : await runScriptedDryRun(options.script, tools, events);
    events.append("run.completed", { status: "completed" });

    return {
      runId,
      status: "completed",
      ...(output === undefined ? {} : { output }),
      events: events.all(),
    };
  } catch (error) {
    if (error instanceof RunBlockedError) {
      return {
        runId,
        status: "blocked",
        events: events.all(),
      };
    }

    events.append("run.error", runtimeErrorPayload(error));
    events.append("run.failed", {
      phase: "runtime",
      status: "failed",
    });

    return {
      runId,
      status: "failed",
      events: events.all(),
    };
  }
}

async function runDefaultDryRun(project: LoadedProject, events: InMemoryEventLog): Promise<string> {
  const output = `Dry run complete for ${project.config.name}.`;
  events.append("assistant.output", { content: output });
  return output;
}

async function runScriptedDryRun(
  script: DryRunScriptStep[],
  tools: DeclaredTool[],
  events: InMemoryEventLog,
): Promise<string | undefined> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  let output: string | undefined;

  for (const step of script) {
    if (step.type === "assistant.output") {
      output = step.content;
      events.append("assistant.output", { content: step.content });
      continue;
    }

    const tool = toolsByName.get(step.toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${step.toolName}`);
    }

    events.append("tool.call", {
      toolName: tool.name,
      arguments: step.arguments,
    });
    const validationError = validateJsonSchemaSubset(step.arguments, tool.inputSchema);
    if (validationError) {
      throw new RuntimeDiagnosticError({
        phase: "tool.validation",
        toolName: tool.name,
        message: `Tool ${tool.name} arguments invalid: ${validationError}`,
      });
    }

    if (tool.approval.required) {
      events.append("approval.required", {
        toolName: tool.name,
        arguments: step.arguments,
        approval: tool.approval,
      });
      events.append("run.blocked", {
        status: "blocked",
        toolName: tool.name,
      });
      throw new RunBlockedError();
    }

    const result = await tool.handler(step.arguments);
    events.append("tool.result", {
      toolName: tool.name,
      result,
    });
  }

  return output;
}

export interface ComposedInstructions {
  sources: string[];
  content: string;
}

export async function composeInstructions(project: LoadedProject): Promise<ComposedInstructions> {
  const sources = ["agent.md"];
  const parts = [await readFile(join(project.root, "agent.md"), "utf8")];
  const skillNames = (await readdir(join(project.root, "skills")))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  for (const skillName of skillNames) {
    const source = `skills/${skillName}`;
    sources.push(source);
    parts.push(await readFile(join(project.root, source), "utf8"));
  }

  return {
    sources,
    content: parts.map((part) => part.trimEnd()).join("\n\n"),
  };
}

export async function discoverTools(project: LoadedProject): Promise<DeclaredTool[]> {
  const entries = (await readdir(join(project.root, "tools")))
    .filter((entry) => entry.endsWith(".tool.ts"))
    .sort((left, right) => left.localeCompare(right));

  const tools: DeclaredTool[] = [];
  for (const entry of entries) {
    const source = `tools/${entry}`;
    const module = await importTranspiledTool(join(project.root, source));
    const exportedTool = readDefaultExport(module, source);
    tools.push(normalizeDeclaredTool(exportedTool, source));
  }

  return tools;
}

class InMemoryEventLog {
  readonly #events: PlicoEvent[] = [];

  constructor(private readonly runId: string) {}

  append(type: PlicoEventType, payload: Record<string, unknown>): PlicoEvent {
    const sequence = this.#events.length + 1;
    const event: PlicoEvent = {
      schemaVersion: 1,
      runId: this.runId,
      id: `evt-${String(sequence).padStart(4, "0")}`,
      sequence,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };

    this.#events.push(event);
    return event;
  }

  all(): PlicoEvent[] {
    return [...this.#events];
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown runtime error";
}

function runtimeErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof RuntimeDiagnosticError) {
    return error.payload;
  }

  return {
    phase: "runtime",
    message: errorMessage(error),
  };
}

class RuntimeDiagnosticError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : "Runtime diagnostic error");
  }
}

class RunBlockedError extends Error {}

function validateJsonSchemaSubset(value: unknown, schema: JsonSchemaSubset): string | undefined {
  switch (schema.type) {
    case "object":
      return validateObject(value, schema);
    case "string":
      return typeof value === "string" ? undefined : "expected string";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "expected number";
    case "integer":
      return Number.isInteger(value) ? undefined : "expected integer";
    case "boolean":
      return typeof value === "boolean" ? undefined : "expected boolean";
    case "array":
      return validateArray(value, schema);
  }
}

function validateObject(value: unknown, schema: JsonSchemaSubset): string | undefined {
  if (!isRecord(value) || Array.isArray(value)) {
    return "expected object";
  }

  for (const property of schema.required ?? []) {
    if (!Object.hasOwn(value, property)) {
      return `missing required property ${property}`;
    }
  }

  const properties = schema.properties ?? {};
  for (const [property, propertyValue] of Object.entries(value)) {
    const propertySchema = properties[property];
    if (!propertySchema) {
      if (schema.additionalProperties === false) {
        return `unknown property ${property}`;
      }
      continue;
    }

    const error = validateJsonSchemaSubset(propertyValue, propertySchema);
    if (error) {
      return `${property}: ${error}`;
    }
  }

  return undefined;
}

function validateArray(value: unknown, schema: JsonSchemaSubset): string | undefined {
  if (!Array.isArray(value)) {
    return "expected array";
  }

  if (!schema.items) {
    return undefined;
  }

  for (const [index, item] of value.entries()) {
    const error = validateJsonSchemaSubset(item, schema.items);
    if (error) {
      return `${index}: ${error}`;
    }
  }

  return undefined;
}

async function importTranspiledTool(toolPath: string): Promise<unknown> {
  const source = await readFile(toolPath, "utf8");
  const { transpileModule, ModuleKind, ScriptTarget } = getTypeScript();
  const transpiled = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: toolPath,
  });

  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function getTypeScript(): typeof import("typescript") {
  return createRequire(import.meta.url)("typescript") as typeof import("typescript");
}

function readDefaultExport(toolModule: unknown, source: string): unknown {
  if (!isRecord(toolModule) || !Object.hasOwn(toolModule, "default")) {
    throw new Error(`${source} must default export a declared tool`);
  }

  return toolModule.default;
}

function normalizeDeclaredTool(value: unknown, source: string): DeclaredTool {
  if (!isRecord(value)) {
    throw new Error(`${source} must default export a declared tool object`);
  }

  const { name, description, inputSchema, capabilities, approval, handler } = value;
  if (typeof name !== "string") {
    throw new Error(`${source} tool name must be a string`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`${source} tool name must match /^[a-z][a-z0-9_]*$/`);
  }
  if (typeof description !== "string") {
    throw new Error(`${source} tool description must be a string`);
  }
  if (!isJsonSchemaSubset(inputSchema)) {
    throw new Error(`${source} inputSchema must be a supported JSON Schema subset`);
  }
  if (
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === "string")
  ) {
    throw new Error(`${source} capabilities must be an array of strings`);
  }
  if (!isRecord(approval) || typeof approval.required !== "boolean") {
    throw new Error(`${source} approval must declare a required boolean`);
  }
  if (!isToolHandler(handler)) {
    throw new Error(`${source} handler must be a function`);
  }

  return {
    source,
    name,
    description,
    inputSchema,
    capabilities,
    approval: {
      required: approval.required,
      ...(typeof approval.reason === "string" ? { reason: approval.reason } : {}),
    },
    handler,
  };
}

function isJsonSchemaSubset(value: unknown): value is JsonSchemaSubset {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (!["object", "string", "number", "integer", "boolean", "array"].includes(value.type)) {
    return false;
  }

  if (value.properties !== undefined) {
    if (!isRecord(value.properties)) {
      return false;
    }
    for (const propertySchema of Object.values(value.properties)) {
      if (!isJsonSchemaSubset(propertySchema)) {
        return false;
      }
    }
  }

  if (value.required !== undefined) {
    if (
      !Array.isArray(value.required) ||
      !value.required.every((entry) => typeof entry === "string")
    ) {
      return false;
    }
  }

  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== "boolean") {
    return false;
  }

  if (value.items !== undefined && !isJsonSchemaSubset(value.items)) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolHandler(value: unknown): value is DeclaredTool["handler"] {
  return typeof value === "function";
}
