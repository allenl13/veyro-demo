import { ACTIVE_RESEARCH_MODEL, annualCoreScoreWeights, annualCoreGrowthScoreCeiling } from "./annual-core-policy.ts";
import { RESEARCH_V2_CORE_FACTORS } from "./research-v2-candidate.mjs";

export type ScoreEvidence = {
  value: number | null;
  status: string;
  source: string;
  sourceUrls: string[];
  reportingPeriod: string | null;
  observationTime: string | null;
  currency: string | null;
  sourceObservationTime?: string;
  reportingPeriodStart?: string;
  periodBasis?: string;
  marketPrice?: { value: number | null; asOf: string | null; source: string | null;
    currency: string | null; adjustmentBasis: string | null } | null;
};

export type ScoreAssessment = {
  version: string;
  scoringRevision?: string;
  score: number | null;
  researchRanked: boolean;
  missingCore?: string[];
  rankReasons?: string[];
  reportingPeriod?: string | null;
  evidence?: Record<string, ScoreEvidence>;
};

export type ScoreStock = {
  researchV2?: ScoreAssessment;
  opportunityScore: number;
  dataBasis?: string;
  financialSourceUrl?: string;
  currentPrice: number | null;
  priceAsOf: string | null;
  valuationBasis?: {
    status: string; reportingCurrency: string; valuationCurrency: string;
    priceAsOf: string; financialPeriod: string; ordinarySharesPerListedShare: number;
    fx?: { reportingCurrency: string; valuationCurrency: string; usdPerReportingUnit: number;
      observationDate: string; fetchedAt: string; sourceUrl: string; basis: string } | null;
  } | null;
};

const DAY = 86_400_000;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validDay = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const dated = (value: unknown, end: number) => typeof value === "string" &&
  Number.isFinite(Date.parse(value)) && Date.parse(value) <= end;
const sourceUrl = (value: unknown) => typeof value === "string" && /^https:\/\/[^/\s]+\/\S+/.test(value);

/** Check only inputs used by the score. Purchase safety remains a separate check. */
export function researchScoreVerificationReasons(stock: ScoreStock, scanGeneratedAt: string, now: string) {
  const assessment = stock.researchV2;
  const observed = Date.parse(scanGeneratedAt);
  const current = Date.parse(now);
  const reasons: string[] = [];
  if (!Number.isFinite(observed) || !Number.isFinite(current) || observed > current || current - observed > 7 * DAY) {
    reasons.push("Research assessment is stale or has an invalid observation time");
  }
  if (!assessment || assessment.version !== ACTIVE_RESEARCH_MODEL || !assessment.researchRanked ||
    !finite(assessment.score) || assessment.score < 0 || assessment.score > 100 ||
    assessment.score !== stock.opportunityScore || !Array.isArray(assessment.missingCore) ||
    assessment.missingCore.length || !Array.isArray(assessment.rankReasons) || assessment.rankReasons.length) {
    reasons.push("Comparable research score is unavailable or inconsistent");
  }
  if (!assessment?.evidence || !validDay(assessment.reportingPeriod) ||
    !["annual", "ttm"].includes(stock.dataBasis ?? "") || !sourceUrl(stock.financialSourceUrl)) {
    return [...reasons, "Scoring input provenance is unavailable"];
  }
  const evidence = assessment.evidence;
  for (const factor of RESEARCH_V2_CORE_FACTORS) {
    const item = evidence[factor.key];
    const history = factor.key === "revenue_cagr_3y" || factor.key === "share_count_cagr_3y";
    const limit = history || stock.dataBasis === "annual" ? 400 : 220;
    const age = item && validDay(item.reportingPeriod) ? (observed - Date.parse(item.reportingPeriod)) / DAY : NaN;
    if (!item || !finite(item.value) || !["verified_numeric", "verified_zero"].includes(item.status) ||
      (item.status === "verified_zero") !== (item.value === 0) || !item.source ||
      !dated(item.observationTime, observed) || !Number.isFinite(age) || age < 0 || age > limit ||
      (item.sourceObservationTime !== undefined && !dated(item.sourceObservationTime, Date.parse(item.observationTime!)))) {
      reasons.push(`Scoring input ${factor.key} is unavailable, stale or invalid`);
      continue;
    }
    if (factor.key === "ai_linkage") continue;
    // Older annual assessments retain their filing URL at company level.
    if (!Array.isArray(item.sourceUrls) || item.sourceUrls.some(url => !sourceUrl(url)) ||
      (!item.sourceUrls.length && stock.dataBasis !== "annual")) {
      reasons.push(`Scoring input ${factor.key} has no verified financial source`);
    }
    if (!history && item.reportingPeriod !== assessment.reportingPeriod) {
      reasons.push(`Scoring input ${factor.key} has an incompatible reporting period`);
    }
    if (history && item.reportingPeriodStart !== undefined &&
      (!validDay(item.reportingPeriodStart) || item.periodBasis !== "annual" ||
        Math.abs((Date.parse(item.reportingPeriod!) - Date.parse(item.reportingPeriodStart)) / DAY - 3 * 365.25) > 7)) {
      reasons.push(`Scoring input ${factor.key} has incompatible growth history`);
    }
    if (factor.key !== "share_count_cagr_3y" && !/^[A-Z]{3}$/.test(item.currency ?? "")) {
      reasons.push(`Scoring input ${factor.key} has no reporting currency`);
    }
  }
  const valuation = evidence.free_cash_flow_yield;
  const price = valuation?.marketPrice;
  if (!price || !finite(price.value) || price.value <= 0 || price.value !== stock.currentPrice ||
    price.asOf !== stock.priceAsOf || !dated(price.asOf, observed) || !price.source ||
    observed - Date.parse(price.asOf ?? "") > 7 * DAY ||
    !/^[A-Z]{3}$/.test(price.currency ?? "") || !/unadjusted regular-market/i.test(price.adjustmentBasis ?? "")) {
    reasons.push("Scoring valuation price or adjustment basis is invalid");
  }
  if (valuation && price?.currency && valuation.currency !== price.currency) {
    const basis = stock.valuationBasis;
    const fx = basis?.fx;
    if (!basis || basis.status !== "verified" || basis.reportingCurrency !== valuation.currency ||
      basis.valuationCurrency !== price.currency || basis.priceAsOf !== price.asOf ||
      basis.financialPeriod !== assessment.reportingPeriod || !finite(basis.ordinarySharesPerListedShare) ||
      basis.ordinarySharesPerListedShare <= 0 || !fx || fx.reportingCurrency !== valuation.currency ||
      fx.valuationCurrency !== price.currency || !finite(fx.usdPerReportingUnit) || fx.usdPerReportingUnit <= 0 ||
      !validDay(fx.observationDate) || (observed - Date.parse(fx.observationDate)) / DAY < 0 ||
      (observed - Date.parse(fx.observationDate)) / DAY > 7 || !dated(fx.fetchedAt, observed) ||
      !sourceUrl(fx.sourceUrl) || !fx.basis) {
      reasons.push("Scoring currency conversion is unavailable or inconsistent");
    }
  }
  const currencies = [evidence.free_cash_flow_margin?.currency, evidence.net_margin?.currency, valuation?.currency];
  if (new Set(currencies).size !== 1) reasons.push("Scoring profitability currencies do not match");
  const weights = annualCoreScoreWeights(assessment);
  const growthCeiling = annualCoreGrowthScoreCeiling(assessment);
  if (!weights) reasons.push("Research scoring weights are unavailable for this assessment");
  if (weights && growthCeiling !== null && RESEARCH_V2_CORE_FACTORS.every(factor => finite(evidence[factor.key]?.value))) {
    const recalculated = Math.round(RESEARCH_V2_CORE_FACTORS.reduce((sum, factor) => {
      const high = factor.key === 'revenue_cagr_3y' ? growthCeiling : factor.high;
      const normal = Math.max(0, Math.min(100, 100 * (evidence[factor.key].value! - factor.low) / (high - factor.low)));
      return sum + weights[factor.key as keyof typeof weights] * (factor.reverse ? 100 - normal : normal);
    }, 0) * 10) / 10;
    if (recalculated !== assessment.score) reasons.push("Research score does not match its verified scoring inputs");
  }
  return [...new Set(reasons)];
}
