export type MetricKey = "return_on_invested_capital" | "free_cash_flow_margin" | "net_debt_to_ebitda" | "interest_coverage" | "revenue_cagr_3y" | "eps_cagr_3y" | "free_cash_flow_yield" | "earnings_yield" | "ev_to_ebitda" | "price_return_6m" | "price_return_12m";
export type Metrics = Record<MetricKey, number | null> & {
  operating_cash_flow_margin: number | null;
  share_count_cagr_3y: number | null;
  operating_margin_change_3y: number | null;
};
export type ScoreDetail = { metric: MetricKey; rawValue: number | null; score: number | null; weight: number; explanation: string };
export type Analysis = { totalScore: number; confidence: number; classification: string; categoryScores: Record<string, number | null>; redFlags: string[]; details: ScoreDetail[]; unavailableRiskChecks?: string[]; missingEvidencePenalty?: number };
type Rule = { metric: MetricKey; category: "quality" | "growth" | "value" | "momentum"; categoryWeight: number; metricWeight: number; score: (value: number) => number; explanation: string };
export const RESEARCH_CALCULATION_REVISION = "2026-09-27-historical-share-basis-v2";

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const higher = (value: number, poor: number, excellent: number) => clamp((100 * (value - poor)) / (excellent - poor));
const lower = (value: number, excellent: number, poor: number) => 100 - higher(value, excellent, poor);
const round = (value: number) => Math.round(value * 100) / 100;

export const rules: Rule[] = [
  { metric: "return_on_invested_capital", category: "quality", categoryWeight: 0.3, metricWeight: 0.4, score: (x) => higher(x, 0.05, 0.2), explanation: "Approximate after-tax operating return on invested capital." },
  { metric: "free_cash_flow_margin", category: "quality", categoryWeight: 0.3, metricWeight: 0.3, score: (x) => higher(x, 0, 0.2), explanation: "Cash retained after capital expenditure for each revenue dollar." },
  { metric: "net_debt_to_ebitda", category: "quality", categoryWeight: 0.3, metricWeight: 0.2, score: (x) => lower(x, 0, 4), explanation: "Approximate years of EBITDA represented by net debt." },
  { metric: "interest_coverage", category: "quality", categoryWeight: 0.3, metricWeight: 0.1, score: (x) => higher(x, 1.5, 10), explanation: "Operating-income buffer for servicing interest expense." },
  { metric: "revenue_cagr_3y", category: "growth", categoryWeight: 0.2, metricWeight: 0.5, score: (x) => higher(x, -0.05, 0.15), explanation: "Compound annual revenue growth over roughly three years." },
  { metric: "eps_cagr_3y", category: "growth", categoryWeight: 0.2, metricWeight: 0.5, score: (x) => higher(x, -0.1, 0.2), explanation: "Growth in earnings attributable to each diluted share." },
  { metric: "free_cash_flow_yield", category: "value", categoryWeight: 0.3, metricWeight: 0.4, score: (x) => higher(x, 0.01, 0.1), explanation: "Free cash flow divided by estimated market value." },
  { metric: "earnings_yield", category: "value", categoryWeight: 0.3, metricWeight: 0.3, score: (x) => higher(x, 0.01, 0.1), explanation: "Net income divided by estimated market value—the inverse of P/E." },
  { metric: "ev_to_ebitda", category: "value", categoryWeight: 0.3, metricWeight: 0.3, score: (x) => lower(x, 6, 22), explanation: "Debt-inclusive enterprise value relative to approximate EBITDA." },
  { metric: "price_return_6m", category: "momentum", categoryWeight: 0.1, metricWeight: 0.4, score: (x) => higher(x, -0.2, 0.25), explanation: "Six-month price return; unavailable from SEC filing data." },
  { metric: "price_return_12m", category: "momentum", categoryWeight: 0.1, metricWeight: 0.6, score: (x) => higher(x, -0.25, 0.35), explanation: "Twelve-month price return; unavailable from SEC filing data." },
];

export function analyse(metrics: Metrics): Analysis {
  const categories: Record<string, Array<[number, number]>> = {};
  let availableWeight = 0;
  const totalWeight = rules.reduce((sum, rule) => sum + rule.categoryWeight * rule.metricWeight, 0);
  const details = rules.map((rule) => {
    const rawValue = metrics[rule.metric];
    const weight = rule.categoryWeight * rule.metricWeight;
    if (rawValue === null || !Number.isFinite(rawValue)) return { metric: rule.metric, rawValue: null, score: null, weight, explanation: `Missing data. ${rule.explanation}` };
    const score = round(rule.score(rawValue));
    availableWeight += weight;
    (categories[rule.category] ??= []).push([score, rule.metricWeight]);
    return { metric: rule.metric, rawValue, score, weight, explanation: rule.explanation };
  });
  const categoryScores = Object.fromEntries(["quality", "growth", "value", "momentum"].map((category) => {
    const values = categories[category] ?? [];
    const fullWeight = rules.filter(rule => rule.category === category).reduce((sum, rule) => sum + rule.metricWeight, 0);
    // Unavailable raw values and individual scores remain null. Their weight
    // earns no evidence points and is never transferred to stronger inputs.
    return [category, values.length ? round(values.reduce((sum, [score, weight]) => sum + score * weight, 0) / fullWeight) : null];
  }));
  const categoryWeight = [...new Set(rules.map(rule => rule.category))].reduce((sum, category) => sum + rules.find(rule => rule.category === category)!.categoryWeight, 0);
  const base = Object.entries(categoryScores).reduce((sum, [category, score]) => sum + (score ?? 0) * rules.find(rule => rule.category === category)!.categoryWeight, 0) / categoryWeight;
  const redFlags: string[] = [];
  if (metrics.net_debt_to_ebitda !== null && Number.isFinite(metrics.net_debt_to_ebitda) && metrics.net_debt_to_ebitda > 4) redFlags.push("High leverage: net debt/EBITDA is above 4x");
  if (metrics.interest_coverage !== null && Number.isFinite(metrics.interest_coverage) && metrics.interest_coverage < 1.5) redFlags.push("Weak debt service: interest coverage is below 1.5x");
  if (metrics.free_cash_flow_margin !== null && Number.isFinite(metrics.free_cash_flow_margin) && metrics.free_cash_flow_margin < 0) {
    redFlags.push(metrics.operating_cash_flow_margin !== null && metrics.operating_cash_flow_margin >= 0
      ? "Expansion spending exceeds operating cash flow"
      : "Negative operating cash generation");
  }
  if (metrics.share_count_cagr_3y !== null && Number.isFinite(metrics.share_count_cagr_3y) && metrics.share_count_cagr_3y > 0.05) redFlags.push("Material dilution: share count grew more than 5% annually");
  if (metrics.operating_margin_change_3y !== null && Number.isFinite(metrics.operating_margin_change_3y) && metrics.operating_margin_change_3y < -0.05) redFlags.push("Operating margin fell by more than 5 percentage points");
  const unavailableRiskChecks = ["net_debt_to_ebitda", "interest_coverage", "free_cash_flow_margin", "share_count_cagr_3y", "operating_margin_change_3y"]
    .filter(metric => !Number.isFinite(metrics[metric as keyof Metrics]));
  const confidence = round(availableWeight / totalWeight);
  const riskPenalty = Math.min(25, redFlags.length * 7.5);
  // Reserve the same capped deduction for an unassessable risk as for a
  // confirmed risk. It is uncertainty, not an assertion that the risk occurred.
  // Otherwise removing a bad input would erase its risk deduction.
  const missingEvidencePenalty = round(Math.min(25, (redFlags.length + unavailableRiskChecks.length) * 7.5) - riskPenalty);
  const uncertaintyPenalty = Math.max(0, 0.75 - confidence) * 20 + missingEvidencePenalty;
  const totalScore = round(Math.max(0, base - uncertaintyPenalty - riskPenalty));
  const classification = confidence < 0.5 ? "Insufficient data" : redFlags.length ? "Risk review" : totalScore >= 80 ? "Exceptional" : totalScore >= 70 ? "Strong" : totalScore >= 60 ? "Promising" : totalScore >= 50 ? "Mixed" : "Weak";
  return { totalScore, confidence, classification, categoryScores, redFlags, details, unavailableRiskChecks, missingEvidencePenalty };
}
