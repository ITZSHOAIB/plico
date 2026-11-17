import type { EvalReportV2 } from "@plico-ai/contracts";

export interface EvalComparison {
  baselineId: string;
  currentId: string;
  regressed: boolean;
  warnings: string[];
  cases: {
    name: string;
    before: string;
    after: string;
    regressed: boolean;
    deltas: {
      name: string;
      kind: string;
      before: number;
      after: number | null;
      delta: number | null;
    }[];
  }[];
}

export function compareEvalReports(
  baseline: EvalReportV2,
  current: EvalReportV2,
  tolerance = 0,
): EvalComparison {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1)
    throw new Error("Tolerance must be between 0 and 1.");
  const warnings: string[] = [];
  if (baseline.mode !== current.mode) warnings.push("Reports use different execution modes.");
  if (baseline.fixturesDigest !== current.fixturesDigest)
    warnings.push("Eval fixtures differ between reports.");
  const cases = baseline.results.map((before) => {
    const after = current.results.find((r) => r.name === before.name);
    const deltas = (before.scores ?? []).map((score) => {
      const next = after?.scores?.find((s) => s.kind === score.kind && s.name === score.name);
      if (
        score.judge?.model !== next?.judge?.model ||
        score.judge?.servedModel !== next?.judge?.servedModel
      )
        warnings.push(`Different judges for ${before.name}: ${score.name}.`);
      return {
        name: score.name,
        kind: score.kind,
        before: score.score,
        after: next?.score ?? null,
        delta: next ? next.score - score.score : null,
      };
    });
    const regressed =
      !after ||
      (before.status === "pass" && after.status === "fail") ||
      deltas.some((d) => d.delta === null || d.delta < -tolerance - Number.EPSILON);
    return {
      name: before.name,
      before: before.status,
      after: after?.status ?? "missing",
      deltas,
      regressed,
    };
  });
  return {
    baselineId: baseline.id,
    currentId: current.id,
    regressed:
      current.tokenCapReached || current.skipped.length > 0 || cases.some((c) => c.regressed),
    warnings: [...new Set(warnings)],
    cases,
  };
}
