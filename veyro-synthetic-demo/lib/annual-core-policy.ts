export const ACTIVE_RESEARCH_MODEL = "annual-core-v2-2026-09-29";
export const PREVIOUS_BALANCED_POLICY = "annual-core-65-55-growth45-yield5-no-growth-floor-2026-10-03";
export const THEME_LIMITED_BALANCED_POLICY = "annual-core-65-55-growth45-yield5-holding20-2026-10-03";
export const GROWTH45_BALANCED_POLICY = "annual-core-65-55-growth45-yield5-holding20-no-theme-2026-10-03";
export const GROWTH45_SCORING_REVISION = "annual-core-growth45-yield5-cap50-2026-10-03";
export const GROWTH50_HOLDING20_POLICY = "annual-core-65-55-growth50-profit-or-fcf-holding20-no-theme-2026-10-13";
export const GROWTH50_NO_GROWTH_FLOOR_POLICY = "annual-core-65-55-growth50-profit-or-fcf-no-growth-floor-2026-10-13";
export const GROWTH50_TOP15_SCORE65_POLICY = "annual-core-65-top15-exit-growth50-profit-or-fcf-2026-10-13";
export const ACTIVE_BALANCED_POLICY = "annual-core-top15-exit-growth50-profit-or-fcf-no-score-floor-2026-10-13";
export const ACTIVE_SCORING_REVISION = "annual-core-growth50-net0-yield5-cap50-2026-10-13";
export const ACTIVE_PROFITABILITY_REQUIREMENT = "positive_net_or_fcf";
export const ACTIVE_REVENUE_GROWTH_SCORE_CEILING = 0.50;
export const ACTIVE_MIN_REVENUE_GROWTH = null;
export const ACTIVE_CASH_RESERVE_PERCENT = 0;
export const ACTIVE_RESEARCH_WEIGHTS = Object.freeze({
  ai_linkage: 0.15,
  revenue_cagr_3y: 0.50,
  free_cash_flow_margin: 0.20,
  net_margin: 0,
  free_cash_flow_yield: 0.05,
  share_count_cagr_3y: 0.10,
});
const GROWTH45_RESEARCH_WEIGHTS = Object.freeze({
  ...ACTIVE_RESEARCH_WEIGHTS, revenue_cagr_3y: 0.45, net_margin: 0.05,
});
const GROWTH40_RESEARCH_WEIGHTS = Object.freeze({
  ...ACTIVE_RESEARCH_WEIGHTS, revenue_cagr_3y: 0.40, net_margin: 0.05, free_cash_flow_yield: 0.10,
});
const GROWTH30_RESEARCH_WEIGHTS = Object.freeze({
  ...ACTIVE_RESEARCH_WEIGHTS, revenue_cagr_3y: 0.30, net_margin: 0.15, free_cash_flow_yield: 0.10,
});
const GROWTH25_RESEARCH_WEIGHTS = Object.freeze({
  ...ACTIVE_RESEARCH_WEIGHTS, revenue_cagr_3y: 0.25, net_margin: 0.15, free_cash_flow_yield: 0.15,
});
const ORIGINAL_RESEARCH_WEIGHTS = Object.freeze({
  ...ACTIVE_RESEARCH_WEIGHTS, revenue_cagr_3y: 0.20, net_margin: 0.15, free_cash_flow_yield: 0.20,
});
export const BUY_SCORE_THRESHOLD: number | null = null;

export function isAnnualCoreDecisionPolicy(value: string | undefined) {
  return value === ACTIVE_RESEARCH_MODEL || value === "annual-core-70-55-2026-10-02" ||
    value === "annual-core-70-55-score-verification-2026-10-02" ||
    value === "annual-core-70-55-growth-weighting-2026-10-03" ||
    value === "annual-core-70-55-growth30-yield10-2026-10-03" ||
    value === "annual-core-70-55-growth40-entry20-2026-10-03" ||
    value === "annual-core-65-55-growth40-entry20-2026-10-03" ||
    value === "annual-core-65-55-growth45-yield5-entry20-2026-10-03" ||
    value === PREVIOUS_BALANCED_POLICY || value === THEME_LIMITED_BALANCED_POLICY ||
    value === GROWTH45_BALANCED_POLICY || value === GROWTH50_HOLDING20_POLICY ||
    value === GROWTH50_NO_GROWTH_FLOOR_POLICY || value === GROWTH50_TOP15_SCORE65_POLICY || value === ACTIVE_BALANCED_POLICY;
}

/** Saved assessments retain their recorded weights and growth ceiling. */
export function annualCoreScoreWeights(assessment: { scoringRevision?: string } | undefined) {
  if (assessment?.scoringRevision === ACTIVE_SCORING_REVISION) return ACTIVE_RESEARCH_WEIGHTS;
  if (assessment?.scoringRevision === GROWTH45_SCORING_REVISION) return GROWTH45_RESEARCH_WEIGHTS;
  if (assessment?.scoringRevision === "annual-core-growth40-net5-cap50-2026-10-03") return GROWTH40_RESEARCH_WEIGHTS;
  if (assessment?.scoringRevision === "annual-core-growth30-yield10-2026-10-03") return GROWTH30_RESEARCH_WEIGHTS;
  if (assessment?.scoringRevision === "annual-core-growth25-yield15-2026-10-03") return GROWTH25_RESEARCH_WEIGHTS;
  if (assessment && assessment.scoringRevision === undefined) return ORIGINAL_RESEARCH_WEIGHTS;
  return null;
}

export function annualCoreGrowthScoreCeiling(assessment: { scoringRevision?: string } | undefined) {
  if (!annualCoreScoreWeights(assessment)) return null;
  if (assessment?.scoringRevision === ACTIVE_SCORING_REVISION) return ACTIVE_REVENUE_GROWTH_SCORE_CEILING;
  if (assessment?.scoringRevision === GROWTH45_SCORING_REVISION) return 0.50;
  return assessment?.scoringRevision === "annual-core-growth40-net5-cap50-2026-10-03" ? 0.50 : 0.25;
}

export function annualCoreWeightDescription(assessment: { scoringRevision?: string; portfolioPolicy?: string }) {
  const weights = annualCoreScoreWeights(assessment);
  if (!weights) return "Scoring weights unavailable for this assessment.";
  const ceiling = Math.round(annualCoreGrowthScoreCeiling(assessment)! * 100);
  const minimum = assessment.scoringRevision === ACTIVE_SCORING_REVISION || assessment.scoringRevision === GROWTH45_SCORING_REVISION ?
    ([ACTIVE_BALANCED_POLICY, GROWTH50_TOP15_SCORE65_POLICY, GROWTH50_NO_GROWTH_FLOOR_POLICY, PREVIOUS_BALANCED_POLICY].includes(assessment.portfolioPolicy ?? "") ? null : 0.20) :
    assessment.scoringRevision === "annual-core-growth40-net5-cap50-2026-10-03" ? 0.20 : 0.10;
  const growthRequirement = minimum === null
    ? "New simulated purchases have no separate revenue-growth minimum."
    : `New simulated purchases require at least ${Math.round(minimum * 100)}% three-year annualised revenue growth.`;
  const netWeight = weights.net_margin > 0 ? `net margin ${Math.round(weights.net_margin * 100)}%, ` : "";
  const profitability = weights.net_margin === 0
    ? " Net margin does not contribute points; it remains verified for the entry check. New simulated purchases require positive net profit or positive free cash flow."
    : "";
  return `AI linkage 15%, revenue growth ${Math.round(weights.revenue_cagr_3y * 100)}%, free-cash-flow margin 20%, ${netWeight}free-cash-flow yield ${Math.round(weights.free_cash_flow_yield * 100)}%, and share-count growth 10%. Revenue growth earns maximum growth points at ${ceiling}% a year. ${growthRequirement}${profitability} A missing core input leaves the score unavailable.`;
}

type Assessment = {
  version: string;
  scoringRevision?: string;
  evidence?: Record<string, { value: number | null }>;
  score: number | null;
  researchRanked: boolean;
  simulatedBuyEligible: boolean;
  buyReasons: string[];
};

export function annualCoreBuyReasons(assessment: Assessment) {
  if (assessment.version !== ACTIVE_RESEARCH_MODEL) {
    return ["Current annual-core research assessment is unavailable"];
  }
  const weightingReasons = assessment.scoringRevision === ACTIVE_SCORING_REVISION ? [] :
    ["Current research weighting assessment is unavailable; a new research scan is required"];
  if (!Number.isFinite(assessment.score)) return [...assessment.buyReasons, ...weightingReasons];
  // Retired entry floors are not current blockers. Saved eligibility stays
  // authoritative until a new assessment verifies the remaining purchase checks.
  const reasons = assessment.buyReasons.filter(reason =>
    reason !== "Candidate score below 65" && reason !== "Candidate score below 70" &&
    reason !== "Revenue growth below 20%");
  if (BUY_SCORE_THRESHOLD !== null && assessment.score! < BUY_SCORE_THRESHOLD) reasons.push(`Candidate score below ${BUY_SCORE_THRESHOLD}`);
  return [...reasons, ...weightingReasons];
}

export function annualCoreBuyEligible(assessment: Assessment) {
  return assessment.version === ACTIVE_RESEARCH_MODEL && assessment.researchRanked &&
    Number.isFinite(assessment.score) && (BUY_SCORE_THRESHOLD === null || assessment.score! >= BUY_SCORE_THRESHOLD) &&
    assessment.simulatedBuyEligible && annualCoreBuyReasons(assessment).length === 0;
}
