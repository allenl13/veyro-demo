export type DiscoverRiskKind = "watch" | "material";

export type DiscoverRiskPresentation = {
  text: string;
  kind: DiscoverRiskKind;
  label: "Watch" | "Material risk";
};

const COMPACT_RISK_SUMMARIES = new Map<string, string>([
  ["Capital spending outruns returns", "Capex outruns returns"],
  ["Hyperscaler capital spending slows", "Hyperscaler capex slows"],
  ["Accelerator adoption trails competitors", "Accelerator adoption lags"],
  ["Semiconductor capital-spending cycle", "Semiconductor capex cycle"],
  ["AI infrastructure spending outruns monetisation", "AI spend outruns monetisation"],
  ["Material dilution: share count grew more than 5% annually", "Dilution"],
  ["AI demand is diluted across a diversified portfolio", "Diversification dilutes AI demand"],
]);

type DiscoverRiskSource = {
  aiThesisRisks?: string[];
  redFlags: string[];
};

function presentRisk(text: string, kind: DiscoverRiskKind): DiscoverRiskPresentation {
  return {
    text,
    kind,
    label: kind === "material" ? "Material risk" : "Watch",
  };
}

export function compactDiscoverRiskText(text: string): string {
  return COMPACT_RISK_SUMMARIES.get(text) ?? text;
}

export function principalDiscoverRisk(stock: DiscoverRiskSource): DiscoverRiskPresentation | null {
  const materialRisk = stock.redFlags.find(Boolean);
  if (materialRisk) return presentRisk(materialRisk, "material");

  const thesisRisk = stock.aiThesisRisks?.find(Boolean);
  return thesisRisk ? presentRisk(thesisRisk, "watch") : null;
}

export function allDiscoverRisks(stock: DiscoverRiskSource): DiscoverRiskPresentation[] {
  const risks = new Map<string, DiscoverRiskPresentation>();

  for (const text of stock.aiThesisRisks ?? []) {
    if (text && !risks.has(text)) risks.set(text, presentRisk(text, "watch"));
  }
  for (const text of stock.redFlags) {
    if (text) risks.set(text, presentRisk(text, "material"));
  }

  return [...risks.values()];
}
