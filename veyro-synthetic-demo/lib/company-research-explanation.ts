type CompanyResearchExplanationSource = {
  aiEconomicLinkage?: string | null;
  aiEvidence?: string[] | null;
  aiTheme?: string | null;
  valuationScore?: number | null;
  sectorModelLabel?: string | null;
  freeCashFlowMargin?: number | null;
  operatingCashFlowMargin?: number | null;
  netMargin?: number | null;
  revenueGrowth3y?: number | null;
};

export type CompanyResearchExplanation = {
  aiOpportunity: string;
  valuation: string;
  financialEvidence: string;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function wholePercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function valuationLabel(score: number) {
  if (score >= 70) return "attractive";
  if (score >= 40) return "fair";
  return "expensive";
}

function financialMetric(label: string, value: number | null | undefined) {
  return finite(value) ? `${label} is ${wholePercent(value)}` : null;
}

export function companyResearchExplanation(
  stock: CompanyResearchExplanationSource,
): CompanyResearchExplanation {
  const economicLinkage = stock.aiEconomicLinkage?.trim();
  const savedEvidence = stock.aiEvidence?.find((item) => item.trim())?.trim().replace(/[.]$/, "");
  const aiTheme = stock.aiTheme?.trim();
  const aiOpportunity = economicLinkage
    || (savedEvidence && aiTheme ? `${savedEvidence}. This gives the company exposure to ${aiTheme}.` : "")
    || savedEvidence
    || (aiTheme ? `The current research identifies ${aiTheme} exposure, but a company-specific economic linkage is unavailable.` : "")
    || "Verified company-specific AI opportunity evidence is unavailable for this reporting period.";

  const sectorModel = stock.sectorModelLabel?.trim();
  const modelDescription = sectorModel
    ? ` using its ${sectorModel}${/model$/i.test(sectorModel) ? "" : " model"}`
    : "";
  const valuation = finite(stock.valuationScore)
    ? `Veyro rates the valuation as ${valuationLabel(stock.valuationScore)} (${Math.round(stock.valuationScore)} / 100)${modelDescription}.`
    : "A current valuation conclusion is unavailable.";

  const cashFlowMetric = financialMetric("Free-cash-flow margin", stock.freeCashFlowMargin)
    ?? financialMetric("Operating-cash-flow margin", stock.operatingCashFlowMargin);
  const profitabilityMetric = financialMetric("Net margin", stock.netMargin);
  const growthMetric = financialMetric("Three-year annualised revenue growth", stock.revenueGrowth3y);
  const metrics = [cashFlowMetric, profitabilityMetric, growthMetric]
    .filter((metric): metric is string => Boolean(metric))
    .slice(0, 2);
  const financialEvidence = metrics.length > 0
    ? `${metrics.join("; ").replace(/; ([A-Z])/, (_, letter: string) => `; ${letter.toLowerCase()}`)}.`
    : "Verified financial metrics are unavailable for this reporting period.";

  return { aiOpportunity, valuation, financialEvidence };
}
