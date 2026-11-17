// The factuality and criterion prompts, and the reasoning instruction, are adapted from autoevals
// (Braintrust, MIT). The rubric prompt follows their shape. See NOTICE.

/** A question for the judge: the prompt, the choices it may pick, and the score of each. */
export interface JudgePrompt {
  prompt: string;
  scores: Record<string, number>;
}

const FACTUALITY_CHOICES = {
  A: "The submitted answer is a subset of the expert answer and is fully consistent with it.",
  B: "The submitted answer is a superset of the expert answer and is fully consistent with it.",
  C: "The submitted answer contains all the same details as the expert answer.",
  D: "There is a disagreement between the submitted answer and the expert answer.",
  E: "The answers differ, but these differences don't matter from the perspective of factuality.",
};
const FACTUALITY_SCORES = { A: 0.4, B: 0.6, C: 1, D: 0, E: 1 };

function withAnswerFormat(body: string, choices: string[]): string {
  return `${body}
Answer the question by giving your reasoning in "reasons" in a step-by-step manner to be sure that your conclusion is correct. Avoid simply stating the correct answer at the outset. Select a single choice by setting "choice" to a single choice from ${JSON.stringify(choices)}.
Reply with only a JSON object of the form {"reasons": "...", "choice": "..."}.`;
}

const listed = (choices: Record<string, string>) =>
  Object.entries(choices)
    .map(([key, text]) => `(${key}) ${text}`)
    .join("\n");

export function criterionPrompt(task: string, submission: string, criterion: string): JudgePrompt {
  const body = `You are assessing a submitted answer on a given task based on a criterion. Here is the data:
[BEGIN DATA]
***
[Task]: ${task}
***
[Submission]: ${submission}
***
[Criterion]: ${criterion}
***
[END DATA]
Does the submission meet the criterion?
(Y) Yes, the submission meets the criterion.
(N) No, it does not.`;
  return { prompt: withAnswerFormat(body, ["Y", "N"]), scores: { Y: 1, N: 0 } };
}

/** Level `n` of `levels.length - 1` scores n over the top level. */
export function rubricPrompt(task: string, submission: string, levels: string[]): JudgePrompt {
  const top = levels.length - 1;
  const choices = Object.fromEntries(levels.map((text, level) => [String(level), text]));
  const body = `You are grading a submitted answer on a given task against a rubric. Here is the data:
[BEGIN DATA]
***
[Task]: ${task}
***
[Submission]: ${submission}
***
[END DATA]
Which rubric level does the submission reach? A level counts only when the submission does every part it names; pick the highest level that fully counts.
${listed(choices)}`;
  return {
    prompt: withAnswerFormat(body, Object.keys(choices)),
    scores: Object.fromEntries(levels.map((_, level) => [String(level), level / top])),
  };
}

export function factualityPrompt(question: string, expert: string, output: string): JudgePrompt {
  const body = `You are comparing a submitted answer to an expert answer on a given question. Here is the data:
[BEGIN DATA]
************
[Question]: ${question}
************
[Expert]: ${expert}
************
[Submission]: ${output}
************
[END DATA]
Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.
The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
${listed(FACTUALITY_CHOICES)}`;
  return {
    prompt: withAnswerFormat(body, Object.keys(FACTUALITY_CHOICES)),
    scores: FACTUALITY_SCORES,
  };
}
