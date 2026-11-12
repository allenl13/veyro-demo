import { ACTIVE_RESEARCH_MODEL, ACTIVE_SCORING_REVISION } from "./annual-core-policy.ts";
import { knownNonCoreFinancialExclusion } from "./purchase-risk-policy.mjs";
import { researchScoreVerificationReasons, type ScoreStock } from "./research-score-verification.ts";

export const RESEARCH_RANK_LIMIT = 15;

type RankingStock = ScoreStock & {
  ticker: string;
  confidence: number;
  dataQuality?: string;
  coverageIssues?: Array<{ code: string; message: string }>;
};

/** Research and portfolio decisions share the same score/confidence/ticker order. */
export function compareResearchRanking(
  left: { ticker: string; opportunityScore: number; confidence: number },
  right: { ticker: string; opportunityScore: number; confidence: number },
) {
  return right.opportunityScore - left.opportunityScore ||
    right.confidence - left.confidence || left.ticker.localeCompare(right.ticker);
}

/** Purchase eligibility and execution quotes must not change the research rank. */
export function assessResearchRanking<T extends RankingStock>(
  stocks: readonly T[], scanGeneratedAt: string, now: string, previousScanAt?: string,
) {
  const ranked = stocks.filter(stock => stock.researchV2?.researchRanked).sort(compareResearchRanking);
  const reasons: string[] = [];
  if (!ranked.length) reasons.push("No comparable ranked research is available");
  if (previousScanAt && Date.parse(previousScanAt) > Date.parse(scanGeneratedAt)) {
    reasons.push("Research ranking is older than the last saved assessment");
  }
  if (new Set(stocks.map(stock => stock.ticker)).size !== stocks.length) {
    reasons.push("Research contains duplicate company assessments");
  }
  for (const stock of ranked) {
    const gaps = researchScoreVerificationReasons(stock, scanGeneratedAt, now);
    if (stock.researchV2?.version !== ACTIVE_RESEARCH_MODEL ||
      stock.researchV2.scoringRevision !== ACTIVE_SCORING_REVISION) {
      gaps.push("Current research weighting assessment is unavailable");
    }
    if (!Number.isFinite(stock.confidence) || stock.confidence < 0 || stock.confidence > 1) {
      gaps.push("Ranking confidence is unavailable or invalid");
    }
    if (stock.dataQuality !== "pass" && !knownNonCoreFinancialExclusion(stock)) {
      gaps.push("Financial data exclusion is unexplained");
    }
    if (gaps.length) reasons.push(`${stock.ticker}: ${gaps.join("; ")}`);
  }
  return {
    ranked,
    rankByTicker: new Map(ranked.map((stock, index) => [stock.ticker, index + 1])),
    verified: reasons.length === 0,
    reason: reasons.length ? reasons.join("; ") : "Current comparable research ranking is verified.",
  };
}
