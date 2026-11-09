import { cancel, intro, isCancel, outro, select, spinner, text } from "@clack/prompts";

export interface ScaffoldPrompts {
  intro(message: string): void;
  outro(message: string): void;
  text(options: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
  }): Promise<string | symbol>;
  select(options: {
    message: string;
    options: Array<{ value: string; label: string }>;
  }): Promise<string | symbol>;
  spinner(): {
    start(message: string): void;
    stop(message?: string): void;
  };
  cancel(message: string): void;
  isCancel(value: unknown): boolean;
}

export const defaultScaffoldPrompts: ScaffoldPrompts = {
  intro,
  outro,
  text,
  select: (options) => select(options),
  spinner,
  cancel,
  isCancel,
};
