import { ACTIVE_REVENUE_GROWTH_SCORE_CEILING } from '../../lib/annual-core-policy.ts';
import { RESEARCH_V2_CORE_FACTORS } from '../../lib/research-v2-candidate.mjs';

export const fixtureFinancialSource = 'https://www.sec.gov/Archives/edgar/data/1/filing.htm';
export const fixturePriceAsOf = '2026-08-24T00:00:00.000Z';

export function verifiedScoreEvidence(score) {
  const ai = Math.max(60, score);
  const other = (score - 0.15 * ai) / 0.85;
  return Object.fromEntries(RESEARCH_V2_CORE_FACTORS.map(factor => {
    const normalized = factor.key === 'ai_linkage' ? ai : factor.reverse ? 100 - other : other;
    const high = factor.key === 'revenue_cagr_3y' ? ACTIVE_REVENUE_GROWTH_SCORE_CEILING : factor.high;
    const value = factor.low + (high - factor.low) * normalized / 100;
    return [factor.key, {
      value, status: value === 0 ? 'verified_zero' : 'verified_numeric',
      source: 'verified fixture filing', sourceUrls: [fixtureFinancialSource],
      reportingPeriod: '2026-07-31', observationTime: fixturePriceAsOf,
      currency: ['ai_linkage', 'share_count_cagr_3y'].includes(factor.key) ? null : 'USD',
      ...(factor.key === 'free_cash_flow_yield' ? {
        marketPrice: { value: 100, asOf: fixturePriceAsOf, source: 'verified fixture quote',
          currency: 'USD', adjustmentBasis: 'unadjusted regular-market five-minute bar close' },
      } : {}),
    }];
  }));
}
