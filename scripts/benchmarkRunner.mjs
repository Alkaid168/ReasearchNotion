/**
 * Pure helpers for the T6 agent benchmark runner.
 *
 * Kept side-effect-free so they can be unit-tested in isolation. The benchmark
 * scripts (benchmark-dify-tool-agent.mjs / benchmark-dify-agent-trust.mjs) and
 * the runner compose these to produce per-run scores, pass^k / pass^1 aggregates
 * and baseline regression diffs.
 */

/** @typedef {{ tools: string[], evidencePaperIds: string[], answer: string }} RunEvidence */
/** @typedef {{ id: string, requiredTools?: string[], requiredEvidencePaperIds?: string[], expected?: RegExp }} ScoredCase */
/** @typedef {{ passed: boolean, score: number }} ScoredRun */
/** @typedef {{ id: string, passK: boolean, pass1: boolean, scoreAvg: number, runCount: number }} AggregatedCase */
/** @typedef {{ id: string, passK: boolean, scoreAvg: number }} BaselineCase */
/** @typedef {{ id: string, reason: string, baseline: BaselineCase, current: BaselineCase }} Regression */

/**
 * Numeric per-run scores for a single case execution.
 * - toolRecall: share of requiredTools the agent actually called.
 * - evidenceCoverage: share of requiredEvidencePaperIds it gathered evidence for.
 * - answerQuality: 1 when the expected regex matches the answer, else 0.
 * Omitted case requirements default to 1 so an unset dimension is not punished.
 */
export function computeRunScores(run, benchmarkCase) {
  const requiredTools = benchmarkCase.requiredTools ?? []
  const toolRecall =
    requiredTools.length === 0
      ? 1
      : requiredTools.filter((tool) => run.tools.includes(tool)).length / requiredTools.length

  const requiredEvidence = benchmarkCase.requiredEvidencePaperIds ?? []
  const evidenceCoverage =
    requiredEvidence.length === 0
      ? 1
      : requiredEvidence.filter((paperId) => run.evidencePaperIds.includes(paperId)).length /
        requiredEvidence.length

  const answerQuality = benchmarkCase.expected ? (benchmarkCase.expected.test(run.answer) ? 1 : 0) : 1
  const score = (toolRecall + evidenceCoverage + answerQuality) / 3
  return { toolRecall, evidenceCoverage, answerQuality, score }
}

/**
 * Aggregate k runs of the same case into pass^k / pass^1 / average score.
 * pass^k requires every run to pass; pass^1 only one. Empty run lists are not
 * treated as vacuously passing.
 */
export function aggregateCaseRuns(runs) {
  const runCount = runs.length
  const passK = runCount > 0 && runs.every((run) => run.passed)
  const pass1 = runs.some((run) => run.passed)
  const scoreAvg = runCount === 0 ? 0 : runs.reduce((sum, run) => sum + (run.score ?? 0), 0) / runCount
  return { passK, pass1, scoreAvg, runCount }
}

/**
 * Compare current aggregated cases against a baseline and return regressions.
 * A case regresses when:
 *   - it was pass^k in the baseline but is no longer, OR
 *   - its scoreAvg dropped by more than `threshold` (default 0.1).
 * New cases absent from the baseline are ignored (not regressions).
 */
export function diffBaseline(current, baseline, threshold = 0.1) {
  const baselineById = new Map(baseline.map((entry) => [entry.id, entry]))
  const regressions = []
  for (const currentCase of current) {
    const baselineCase = baselineById.get(currentCase.id)
    if (!baselineCase) continue
    if (baselineCase.passK && !currentCase.passK) {
      regressions.push({
        id: currentCase.id,
        reason: `pass^k regressed (baseline pass, current fail)`,
        baseline: baselineCase,
        current: currentCase
      })
    } else if (currentCase.scoreAvg < baselineCase.scoreAvg - threshold) {
      regressions.push({
        id: currentCase.id,
        reason: `scoreAvg dropped ${baselineCase.scoreAvg.toFixed(2)} -> ${currentCase.scoreAvg.toFixed(2)} (> ${threshold})`,
        baseline: baselineCase,
        current: currentCase
      })
    }
  }
  return regressions
}
