import type { JsonValue } from "./events.js";
import type { ToolInputSchema } from "./tools.js";

/** What `agent()` takes in a workflow. */
export interface WorkflowAgentCall {
  /** The task the agent works on. It sees this and its own instructions, nothing else. */
  task: string;
  /** JSON Schema or Zod. The agent then returns a validated value instead of text. */
  output?: ToolInputSchema;
}

/** What a workflow's `run` receives. */
export interface WorkflowContext<Input = unknown> {
  /** The run's input, validated against `input` when the workflow declares one. */
  input: Input;
  /** Runs an agent as a child run and returns its text, or its structured result with `output`. */
  // biome-ignore lint/suspicious/noExplicitAny: the result type depends on `output`, which the caller knows.
  agent(id: string, call: WorkflowAgentCall): Promise<any>;
  /** Runs a side effect once. On replay the recorded result is returned and `fn` does not run. */
  step<T extends JsonValue | undefined>(name: string, fn: () => T | Promise<T>): Promise<T>;
}

/** The default export of `workflows/<id>.ts`. */
export interface WorkflowDefinition<Input = unknown> {
  description?: string;
  input?: ToolInputSchema;
  output?: ToolInputSchema;
  /** Most `agent()` calls one run may make. Defaults to 20. */
  maxAgentCalls?: number;
  run(context: WorkflowContext<Input>): unknown;
}
