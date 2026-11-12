import { percent } from "./dashboard-format.ts";

/** Presentation only. Never use these groups or labels for scoring or allocation. */
export const COMPANY_GROUPS = [
  { id: "hardware", label: "Hardware", description: "Chips, servers, data centres, power and cooling, and the physical systems that support AI." },
  { id: "networks", label: "Networks", description: "Networking equipment, optical links and connections between systems." },
  { id: "platforms", label: "Platforms", description: "Cloud services, AI models and platforms for working with data." },
  { id: "applications", label: "Applications", description: "Software and products that apply AI to business and everyday tasks." },
] as const;

export type CompanyGroupId = (typeof COMPANY_GROUPS)[number]["id"];
const UNCLASSIFIED_GROUP = { id: "unclassified", label: "Awaiting classification", description: "Reviewed companies whose primary business group has not yet been assigned." } as const;
const MEMBERS: Record<CompanyGroupId, string> = {
  hardware: "DEMO1 DEMO4", networks: "DEMO2 DEMO5", platforms: "DEMO6", applications: "DEMO3 DEMO7",
};
const GROUP_BY_TICKER = new Map(Object.entries(MEMBERS).flatMap(([group, tickers]) =>
  tickers.split(" ").map(ticker => [ticker, group as CompanyGroupId] as const)));

export function companyGroup(ticker: string) {
  const id = GROUP_BY_TICKER.get(ticker.toUpperCase());
  return COMPANY_GROUPS.find(group => group.id === id) ?? UNCLASSIFIED_GROUP;
}

/** One primary group per ticker; preserve supplied ordering and hide empty groups. */
export function groupCompanies<T extends { ticker: string }>(companies: readonly T[]) {
  const unique = [...new Map(companies.map(company => [company.ticker.toUpperCase(), company])).values()];
  return [...COMPANY_GROUPS, UNCLASSIFIED_GROUP].map(group => ({ ...group, companies: unique.filter(company => companyGroup(company.ticker).id === group.id) }))
    .filter(group => group.companies.length > 0);
}

export function topResearchCompanies<T>(ranked: readonly T[]) {
  return ranked.slice(0, 15);
}

export function companyEvidenceGap(reason: string | null | undefined) {
  if (!reason) return "A complete saved research assessment is unavailable for this company.";
  const labels: Record<string, string> = {
    ai_linkage: "AI business evidence", revenue_cagr_3y: "Three-year annualised revenue growth",
    free_cash_flow_margin: "Free-cash-flow margin", net_margin: "Net margin",
    free_cash_flow_yield: "Free-cash-flow yield", share_count_cagr_3y: "Three-year share-count growth",
    unavailable_source: "supporting source unavailable", unsupported_reporting_basis: "reporting basis not supported",
  };
  return reason.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, key => labels[key] ?? key.replaceAll("_", " "));
}

export function companyCardMetrics(stock: { revenueGrowth3y?: number | null; freeCashFlowMargin?: number | null }) {
  const value = (number: number | null | undefined) => number != null && Number.isFinite(number) ? percent(number) : "Unavailable";
  return [
    { label: "3-year annualised revenue growth", value: value(stock.revenueGrowth3y) },
    { label: "Free-cash-flow margin", value: value(stock.freeCashFlowMargin) },
  ];
}

/** Describe the saved decision; never recompute eligibility or infer an exit. */
export function companyNewBuyStatus(assessment: { simulatedBuyEligible: boolean; buyReasons: string[]; researchRanked?: boolean }) {
  if (assessment.simulatedBuyEligible) return { label: "Meets new-buy criteria", reason: "Portfolio limits determine any addition." };
  const reasons = assessment.buyReasons.map(reason => companyEvidenceGap(reason).replace("Candidate score below", "Research score below"));
  const missing = reasons.some(reason => /unavailable|missing|unsupported|not supported|ambiguous|unverified|mismatch/i.test(reason));
  return {
    label: missing ? assessment.researchRanked === true ? "Safety evidence incomplete" : "Evidence missing"
      : reasons.some(reason => /below|exceeds|above|not positive|fell more/i.test(reason)) ? "Below new-buy threshold" : "New buys restricted",
    reason: reasons.join("; ") || "New-buy checks did not pass.",
  };
}
