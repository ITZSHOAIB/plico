/**
 * The interactive `npm create plico@latest`, as create-plico prints it with clack. Bare, with no
 * directory, it asks; with one it does not, so the replay types the bare command.
 */
export const COMMAND = "npm create plico@latest";

export const PROVIDERS = [
  "Anthropic",
  "OpenAI",
  "Google",
  "OpenAI-compatible server (Ollama, OpenRouter, LiteLLM)",
  "None yet (dry runs only)",
];

/** How far the replay has got */
export const STAGE = {
  typing: 0,
  intro: 1,
  where: 2,
  name: 3,
  provider: 4,
  chosen: 5,
  creating: 6,
  done: 7,
} as const;

export interface Line {
  bar: string;
  text: string;
  tone?: "dim" | "accent" | "picked";
  option?: number;
}

const SPIN = ["◒", "◐", "◓", "◑"];

/** The terminal's lines after `cmd` typed, at `stage`, with option `sel` under the cursor */
export function lines(stage: number, sel: number, spin = 0): Line[] {
  const out: Line[] = [];
  if (stage < STAGE.intro) return out;
  out.push({ bar: "┌", text: "Create a Plico scaffold" }, { bar: "│", text: "" });
  if (stage >= STAGE.where) out.push(...answered("Where should I create it?", "my-plico"));
  if (stage >= STAGE.name) out.push(...answered("Project name?", "my-plico"));
  if (stage === STAGE.provider) {
    out.push({ bar: "◆", text: "Which model provider?", tone: "accent" });
    for (const [i, p] of PROVIDERS.entries())
      out.push({
        bar: "│",
        text: `${i === sel ? "●" : "○"} ${p}`,
        tone: i === sel ? "picked" : "dim",
        option: i,
      });
    out.push({ bar: "└", text: "" });
  }
  if (stage >= STAGE.chosen) out.push(...answered("Which model provider?", PROVIDERS[sel]));
  if (stage === STAGE.creating)
    out.push({ bar: SPIN[spin % SPIN.length], text: "Creating scaffold...", tone: "accent" });
  if (stage >= STAGE.done)
    out.push(
      { bar: "◇", text: "Created scaffold in my-plico" },
      { bar: "│", text: "" },
      { bar: "└", text: "Generated my-plico" },
    );
  return out;
}

function answered(question: string, answer: string): Line[] {
  return [
    { bar: "◇", text: question },
    { bar: "│", text: answer, tone: "dim" },
    { bar: "│", text: "" },
  ];
}
