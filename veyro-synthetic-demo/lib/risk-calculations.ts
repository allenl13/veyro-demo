import type { ShareBasisAdjustment } from "./historical-share-basis";

export type RiskMetric = "netDebtToEbitda" | "interestCoverage" | "freeCashFlowMargin" | "operatingCashFlowMargin" | "shareCountGrowth3y" | "operatingMarginChange3y";
export type CalculationInput = {
  label: string; value: number | null; rawValue?: number; concept?: string; unit?: string;
  start?: string; end?: string; filed?: string; form?: string; accession?: string;
  scale?: number; adjustment?: ShareBasisAdjustment; filingUrl?: string | null;
};
export type CalculationTrace = { value: number | null; inputs: CalculationInput[]; notes: string[] };
export type RiskCalculationTraces = Partial<Record<RiskMetric | "epsGrowth3y", CalculationTrace>>;
export type RiskCalculationSource = Partial<Record<RiskMetric, number | null>> & { riskCalculationTraces?: RiskCalculationTraces };

const DEFINITIONS: Array<{ key: RiskMetric; label: string; formula: string; rule: string; unit: "ratio" | "percent" | "points" }> = [
  { key: "netDebtToEbitda", label: "Net debt / EBITDA", formula: "(Current debt + non-current long-term debt − cash) / (operating income + depreciation and amortisation). Debt, cash and earnings use the same reporting-period end. Current debt must be a reported aggregate or the sum of reported current maturities and short-term borrowings; missing amounts are not treated as zero.", rule: "High leverage when greater than 4×.", unit: "ratio" },
  { key: "interestCoverage", label: "Interest coverage", formula: "Operating income / interest expense, for the revenue reporting period.", rule: "Weak debt service when below 1.5×.", unit: "ratio" },
  { key: "freeCashFlowMargin", label: "Free cash flow margin", formula: "(Operating cash flow − capital expenditure) / revenue, for the same reporting period.", rule: "Below zero triggers a cash-flow flag. Non-negative operating cash flow margin labels it expansion spending; otherwise the current rule labels it negative operating cash generation.", unit: "percent" },
  { key: "operatingCashFlowMargin", label: "Operating cash flow margin", formula: "Operating cash flow / revenue, for the same reporting period.", rule: "Used to distinguish the cash-flow flags. Missing operating cash flow is not proof of negative cash generation.", unit: "percent" },
  { key: "shareCountGrowth3y", label: "Diluted share growth", formula: "(Latest weighted-average diluted shares / earliest of up to three preceding observations) ^ (1 / elapsed years) − 1. Elapsed years = days between period ends / 365.25; at least 0.75 years is required.", rule: "Material dilution when annualised growth exceeds 5%. The available span can differ from three years. Reviewed split adjustments retain the original counts and source; an unresolved presentation basis makes growth unavailable.", unit: "percent" },
  { key: "operatingMarginChange3y", label: "Operating margin change", formula: "Latest operating income / matching revenue − the fourth-last observation’s operating income / matching revenue.", rule: "Flagged when the decrease exceeds 5 percentage points. Four observations are required; the date span can differ from three years.", unit: "points" },
];

export function riskCalculations(source: RiskCalculationSource) {
  return DEFINITIONS.map((definition) => {
    const raw = source[definition.key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const candidate = source.riskCalculationTraces?.[definition.key];
    // Never attach inputs from a different calculation to the saved result.
    const trace = candidate && raw !== undefined && candidate.value === value ? candidate : null;
    const formatted = value === null ? "Unavailable" : definition.unit === "ratio" ? `${value.toFixed(2)}×` : `${(value * 100).toFixed(2)}${definition.unit === "points" ? " percentage points" : "%"}`;
    return { ...definition, value, formatted, trace };
  });
}

export function currentRiskCalculationSource(traces: RiskCalculationTraces): RiskCalculationSource {
  const source: RiskCalculationSource = { riskCalculationTraces: traces };
  for (const { key } of DEFINITIONS) source[key] = traces[key]?.value;
  return source;
}
