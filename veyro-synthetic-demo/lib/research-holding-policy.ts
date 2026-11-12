import { ACTIVE_RESEARCH_MODEL } from "./annual-core-policy.ts";

export type HoldingGrowthAssessment = {
  revenueGrowth3y: number | null;
  verification: "verified" | "needs review";
  verificationReason: string;
  exitQualified: boolean;
};

export type GrowthEvidence = {
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
};
type GrowthStock = {
  researchV2?: { version: string; reportingPeriod?: string | null; evidence?: Record<string, GrowthEvidence> };
  dataBasis?: string;
  financialSourceUrl?: string;
  revenueGrowth3y: number | null;
  dataQuality?: "pass" | "excluded" | "limited";
  coverageIssues?: Array<{ code: string }>;
};
const DAY = 86_400_000;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const day = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const dated = (value: unknown, end: number) => typeof value === "string" &&
  Number.isFinite(Date.parse(value)) && Date.parse(value) <= end;
const sourceUrl = (value: unknown) => typeof value === "string" && /^https:\/\/[^/\s]+\/\S+/.test(value);

/** Retain verified growth evidence; growth contributes to the score without a separate exit trigger. */
export function assessHoldingGrowth(stock: GrowthStock, scanGeneratedAt: string, now: string): HoldingGrowthAssessment {
  const assessment = stock.researchV2;
  const item = assessment?.evidence?.revenue_cagr_3y;
  const observed = Date.parse(scanGeneratedAt), current = Date.parse(now);
  const reasons: string[] = [];
  if (!Number.isFinite(observed) || !Number.isFinite(current) || observed > current || current - observed > 7 * DAY) {
    reasons.push("Revenue-growth assessment is stale or has an invalid observation time");
  }
  if (assessment?.version !== ACTIVE_RESEARCH_MODEL || !day(assessment?.reportingPeriod) ||
    !["annual", "ttm"].includes(stock.dataBasis ?? "") || !sourceUrl(stock.financialSourceUrl)) {
    reasons.push("Revenue-growth provenance is unavailable");
  }
  const age = item && day(item.reportingPeriod) ? (observed - Date.parse(item.reportingPeriod)) / DAY : NaN;
  if (!item || !finite(item.value) || !["verified_numeric", "verified_zero"].includes(item.status) ||
    (item.status === "verified_zero") !== (item.value === 0) || !item.source ||
    !dated(item.observationTime, observed) || !Number.isFinite(age) || age < 0 || age > 400 ||
    (item.sourceObservationTime !== undefined && !dated(item.sourceObservationTime, Date.parse(item.observationTime!)))) {
    reasons.push("Revenue growth is unavailable, stale or invalid");
  }
  if (item && (!Array.isArray(item.sourceUrls) || item.sourceUrls.some(url => !sourceUrl(url)) ||
    (!item.sourceUrls.length && stock.dataBasis !== "annual") || !/^[A-Z]{3}$/.test(item.currency ?? ""))) {
    reasons.push("Revenue growth has no verified financial source or reporting currency");
  }
  if (item?.reportingPeriodStart !== undefined && (!day(item.reportingPeriodStart) ||
    !day(item.reportingPeriod) || item.periodBasis !== "annual" ||
    Math.abs((Date.parse(item.reportingPeriod) - Date.parse(item.reportingPeriodStart)) / DAY - 3 * 365.25) > 7)) {
    reasons.push("Revenue growth has incompatible three-year history");
  }
  if (!finite(stock.revenueGrowth3y) || stock.revenueGrowth3y !== item?.value) {
    reasons.push("Revenue growth does not match its source assessment");
  }
  const knownOtherGap = stock.dataQuality === "excluded" && stock.coverageIssues?.length &&
    stock.coverageIssues.every(issue => ["debt_cash", "metric_coverage"].includes(issue.code));
  if (stock.dataQuality !== "pass" && !knownOtherGap) reasons.push("Financial data exclusion is unexplained");
  const verified = reasons.length === 0;
  return {
    revenueGrowth3y: verified ? item!.value : null,
    verification: verified ? "verified" : "needs review",
    verificationReason: verified ? "Three-year annualised revenue growth and its dated financial sources are verified." :
      [...new Set(reasons)].join("; "),
    // Retain this field for saved assessment compatibility; the growth exit was removed.
    exitQualified: false,
  };
}

export function holdingGrowthStatus(stock: GrowthStock, scanGeneratedAt: string, now: string) {
  const growth = assessHoldingGrowth(stock, scanGeneratedAt, now);
  return growth.verification === "needs review"
      ? { label: "Holding growth needs review", reason: growth.verificationReason }
      : null;
}
