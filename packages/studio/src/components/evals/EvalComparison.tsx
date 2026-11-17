import type { EvalReportV2 } from "@plico-ai/contracts";
import { CodeBlock, Notice, sectionHeadingClass } from "../../ui/Page";
import { EvalScores } from "./EvalCaseScores";

export function EvalComparison({ before, after }: { before: EvalReportV2; after: EvalReportV2 }) {
  const names = [
    ...new Set(
      [...before.results, ...before.skipped, ...after.results, ...after.skipped].map((r) => r.name),
    ),
  ];
  return (
    <section aria-label="Report comparison" className="my-5">
      <h3 className={sectionHeadingClass}>Report comparison</h3>
      {before.mode !== after.mode && <Notice>Reports use different execution modes.</Notice>}
      {before.fixturesDigest !== after.fixturesDigest && (
        <Notice>Eval fixtures differ between reports.</Notice>
      )}
      {(before.tokenCapReached || after.tokenCapReached) && (
        <Notice>A report is incomplete because its token cap was reached.</Notice>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-small">
          <caption className="text-muted">
            {before.id} compared with {after.id}
          </caption>
          <thead>
            <tr>
              <th className="p-3">Case</th>
              <th className="p-3">Before · {before.mode}</th>
              <th className="p-3">After · {after.mode}</th>
              <th className="p-3">Delta</th>
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const a = before.results.find((r) => r.name === name);
              const b = after.results.find((r) => r.name === name);
              const scores = [
                ...new Map(
                  [...(a?.scores ?? []), ...(b?.scores ?? [])].map((s) => [
                    `${s.kind}:${s.name}`,
                    s,
                  ]),
                ).values(),
              ];
              return (
                <tr key={name} className="border-t border-line align-top">
                  <th className="p-3">{name}</th>
                  {[a, b].map((r, index) => {
                    const skipped = (index === 0 ? before : after).skipped.find(
                      (entry) => entry.name === name,
                    );
                    return (
                      <td key={index === 0 ? "before" : "after"} className="min-w-64 p-3">
                        <p>{r?.status ?? (skipped ? `SKIP: ${skipped.reason}` : "Missing case")}</p>
                        {r?.output !== undefined && <CodeBlock>{r.output}</CodeBlock>}
                        <EvalScores scores={r?.scores} />
                      </td>
                    );
                  })}
                  <td className="p-3">
                    {scores.map((s) => {
                      const first = a?.scores?.find((v) => v.name === s.name && v.kind === s.kind);
                      const second = b?.scores?.find((v) => v.name === s.name && v.kind === s.kind);
                      const differentJudge =
                        first &&
                        second &&
                        (first.judge?.model !== second.judge?.model ||
                          first.judge?.servedModel !== second.judge?.servedModel);
                      return (
                        <p key={`${s.kind}:${s.name}`}>
                          {s.name}:{" "}
                          {first && second
                            ? (second.score - first.score).toFixed(3)
                            : "Missing score"}
                          {differentJudge && (
                            <span className="block text-danger">
                              Different judges for {s.name}; this delta may not be comparable.
                            </span>
                          )}
                        </p>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
