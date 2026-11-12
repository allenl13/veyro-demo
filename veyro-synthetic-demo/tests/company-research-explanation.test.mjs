import assert from "node:assert/strict";
import test from "node:test";

import { companyResearchExplanation } from "../lib/company-research-explanation.ts";

test("explains a company with its own AI, valuation and financial evidence", () => {
  assert.deepEqual(companyResearchExplanation({
    aiEconomicLinkage: "Generative creation can support higher-value subscriptions.",
    valuationScore: 81.72,
    sectorModelLabel: "Software / recurring-revenue",
    freeCashFlowMargin: 0.4145,
    operatingCashFlowMargin: 0.422,
    netMargin: 0.29997,
    revenueGrowth3y: 0.1056,
  }), {
    aiOpportunity: "Generative creation can support higher-value subscriptions.",
    valuation: "Veyro rates the valuation as attractive (82 / 100) using its Software / recurring-revenue model.",
    financialEvidence: "Free-cash-flow margin is 41%; net margin is 30%.",
  });
});

test("uses operating cash flow when free cash flow is unavailable", () => {
  const result = companyResearchExplanation({
    valuationScore: 6.52,
    operatingCashFlowMargin: 0.476,
    netMargin: 0.556,
  });
  assert.equal(result.valuation, "Veyro rates the valuation as expensive (7 / 100).");
  assert.equal(result.financialEvidence, "Operating-cash-flow margin is 48%; net margin is 56%.");
});

test("uses saved company evidence when the richer economic linkage is absent", () => {
  const result = companyResearchExplanation({
    aiTheme: "AI applications",
    aiEvidence: ["Creative and document software with generative AI"],
  });
  assert.equal(result.aiOpportunity, "Creative and document software with generative AI. This gives the company exposure to AI applications.");
});

test("preserves negative and zero figures instead of improving missing or weak data", () => {
  const result = companyResearchExplanation({
    valuationScore: 0,
    freeCashFlowMargin: -0.18,
    netMargin: 0,
    revenueGrowth3y: 0.76,
  });
  assert.equal(result.valuation, "Veyro rates the valuation as expensive (0 / 100).");
  assert.equal(result.financialEvidence, "Free-cash-flow margin is -18%; net margin is 0%.");
});

test("states when company-specific evidence is unavailable", () => {
  assert.deepEqual(companyResearchExplanation({}), {
    aiOpportunity: "Verified company-specific AI opportunity evidence is unavailable for this reporting period.",
    valuation: "A current valuation conclusion is unavailable.",
    financialEvidence: "Verified financial metrics are unavailable for this reporting period.",
  });
});
