import type { EvalReportV2, EvalScore, EvalTrial } from "@plico-ai/contracts";
import { CodeBlock, sectionHeadingClass } from "../../ui/Page";
import { EventList } from "../EventList";

type SavedCase = EvalReportV2["results"][number];
export function EvalScores({ scores = [] }: { scores?: EvalScore[] | undefined }) {
  return (
    <ul className="m-0 mb-4 grid list-none gap-2 p-0">
      {scores.map((score) => (
        <li key={`${score.kind}-${score.name}`} className="rounded-control border border-line p-3">
          <strong>{score.name}</strong> · {score.score} / 1 · {score.passed ? "PASS" : "FAIL"}{" "}
          (threshold {score.threshold})
          {score.reason && <p className="my-1 text-small">{score.reason}</p>}
          {score.judge && (
            <details className="text-small text-muted">
              <summary>Judge: {score.judge.servedModel ?? score.judge.model}</summary>
              <p>Requested: {score.judge.model}</p>
              <CodeBlock>{score.judge.prompt}</CodeBlock>
              <CodeBlock>{score.judge.raw}</CodeBlock>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
export function EvalTrials({ trials = [] }: { trials?: EvalTrial[] | undefined }) {
  return (
    <div className="grid gap-5">
      {trials.map((trial, index) => (
        <section key={trial.runId} aria-label={`Trial ${index + 1}`}>
          <h3 className={sectionHeadingClass}>
            Trial {index + 1} · {trial.status}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4>Transcript</h4>
              <EventList events={trial.events} />
            </div>
            <div>
              {trial.output && <CodeBlock>{trial.output}</CodeBlock>}
              {trial.structuredOutput !== undefined && (
                <CodeBlock>{JSON.stringify(trial.structuredOutput, null, 2)}</CodeBlock>
              )}
              <EvalScores scores={trial.scores} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
export function EvalCaseScores({ result }: { result: SavedCase }) {
  return (
    <>
      <h3 className={sectionHeadingClass}>Scores and reasons</h3>
      <EvalScores scores={result.scores} />
      <EvalTrials trials={result.trials} />
    </>
  );
}
