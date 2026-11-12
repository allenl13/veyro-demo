import type { MetricKey } from "./scoring";

export type SavedScoreEvidence = {
  missingMetrics: MetricKey[];
  unavailableRiskChecks: string[];
  missingEvidencePenalty: number;
  previousScore: number | null;
  previousScanAt: string | null;
};

type ScoreStock = { opportunityScore: number; scoreEvidence?: SavedScoreEvidence };

const metricLabels: Record<MetricKey, string> = {
  return_on_invested_capital: "Return on invested capital",
  free_cash_flow_margin: "Free-cash-flow margin",
  net_debt_to_ebitda: "Net debt to EBITDA",
  interest_coverage: "Interest coverage",
  revenue_cagr_3y: "Three-year revenue growth",
  eps_cagr_3y: "Three-year earnings-per-share growth",
  free_cash_flow_yield: "Free-cash-flow yield",
  earnings_yield: "Earnings yield",
  ev_to_ebitda: "Enterprise value to EBITDA",
  price_return_6m: "Six-month price return",
  price_return_12m: "Twelve-month price return",
};
const riskCheckLabels: Record<string, string> = {
  ...metricLabels,
  share_count_cagr_3y: "Three-year share-count growth",
  operating_margin_change_3y: "Three-year operating-margin change",
};
const nonMaterialPriceHistoryGaps = new Set<MetricKey>(["price_return_6m", "price_return_12m"]);

/** Missing evidence that makes a score unsuitable for a simple cutoff label. */
export function materialResearchScoreGaps(evidence: SavedScoreEvidence | undefined) {
  if (!evidence) return ["Saved score evidence is unavailable"];
  const riskChecks = evidence.unavailableRiskChecks
    .map(check => riskCheckLabels[check] ?? check);
  const missing = evidence.missingMetrics
    .filter(metric => !nonMaterialPriceHistoryGaps.has(metric))
    .map(metric => metricLabels[metric] ?? metric)
    .filter(label => !riskChecks.includes(label));
  const issues = [
    ...(missing.length ? [`Missing score inputs: ${[...new Set(missing)].join(", ")}`] : []),
    ...(riskChecks.length ? [`Risk checks unavailable: ${[...new Set(riskChecks)].join(", ")}`] : []),
  ];
  if (evidence.missingEvidencePenalty > 0 && issues.length === 0) {
    issues.push("Score includes a missing-evidence penalty");
  }
  return issues;
}

export function formatResearchScore(value: number | null) {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(1)} / 100` : "Unavailable";
}

/** Presentation only: never infer a previous score or missing input from a live filing. */
export function researchScoreExplanation(stock: ScoreStock) {
  const evidence = stock.scoreEvidence;
  if (!evidence) return null;
  const previousScore = evidence.previousScore;
  const previousScanAt = evidence.previousScanAt;
  const comparison = previousScore !== null && Number.isFinite(previousScore)
    && typeof previousScanAt === "string" && Number.isFinite(Date.parse(previousScanAt))
    ? { previous: formatResearchScore(previousScore), current: formatResearchScore(stock.opportunityScore), observedAt: previousScanAt }
    : null;
  const missingInputs = [...new Set(evidence.missingMetrics)]
    .map(metric => metricLabels[metric])
    .filter((label): label is string => Boolean(label));
  const riskChecks = [...new Set(evidence.unavailableRiskChecks)]
    .map(metric => riskCheckLabels[metric])
    .filter((label): label is string => Boolean(label));
  const uncertainty = Number.isFinite(evidence.missingEvidencePenalty) && evidence.missingEvidencePenalty > 0
    ? evidence.missingEvidencePenalty.toFixed(1) : null;
  return { comparison, missingInputs, riskChecks, uncertainty };
}
