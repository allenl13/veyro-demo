import {
  dynamicGuardrails,
  type ResearchStock,
} from "./autopilot-engine.ts";
import { ACTIVE_CASH_RESERVE_PERCENT, ACTIVE_RESEARCH_MODEL } from "./annual-core-policy.ts";

const REFERENCE_THEMES = [
  "AI software",
  "AI chips",
  "AI networking",
  "AI data centres",
] as const;

function referenceOpportunity(index: number): ResearchStock {
  return {
    ticker: `DISPLAY${index}`,
    name: `Display reference ${index}`,
    aiTheme: REFERENCE_THEMES[index % REFERENCE_THEMES.length],
    currentPrice: 100,
    priceChangePercent: 0,
    priceAsOf: "2026-01-01T16:00:00.000Z",
    revenueGrowth3y: 1,
    netMargin: 1,
    opportunityScore: 100,
    valuationScore: 100,
    exposureScore: 100,
    aiEvidenceScore: 100,
    signal: "Exceptional",
    qualityScore: 100,
    confidence: 1,
    redFlags: [],
    dataQuality: "pass",
  };
}

function guardrailsForOpportunityCount(count: number) {
  const stocks = Array.from({ length: count }, (_, index) => referenceOpportunity(index));
  const guardrails = dynamicGuardrails(stocks, "ai-opportunities-v2");
  return guardrails.opportunities.length === count ? guardrails : null;
}

function validCount(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function aiOpportunitiesRuleDisplay({
  qualifyingOpportunityCount,
  maxPositionPercent,
  maxPositions,
  balancedPolicy = "ai-opportunities-v2",
}: {
  qualifyingOpportunityCount: number | null;
  maxPositionPercent: number | null;
  maxPositions: number | null;
  balancedPolicy?: typeof ACTIVE_RESEARCH_MODEL | "ai-opportunities-v2";
}) {
  const currentGuardrails = validCount(qualifyingOpportunityCount)
    ? guardrailsForOpportunityCount(qualifyingOpportunityCount)
    : null;
  return {
    effectiveCashReservePercent: balancedPolicy === ACTIVE_RESEARCH_MODEL
      ? ACTIVE_CASH_RESERVE_PERCENT
      : currentGuardrails?.cashReservePercent ?? null,
    maxPositionPercent: Number.isFinite(maxPositionPercent) && maxPositionPercent! > 0 && maxPositionPercent! <= 1
      ? maxPositionPercent
      : null,
    maxPositions: validCount(maxPositions) && maxPositions! > 0 ? maxPositions : null,
  };
}
