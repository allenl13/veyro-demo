import { assessResearchV2Candidate } from '../lib/research-v2-candidate.mjs';
import { ACTIVE_BALANCED_POLICY, ACTIVE_MIN_REVENUE_GROWTH, ACTIVE_PROFITABILITY_REQUIREMENT, ACTIVE_RESEARCH_MODEL, ACTIVE_SCORING_REVISION, ACTIVE_RESEARCH_WEIGHTS, ACTIVE_REVENUE_GROWTH_SCORE_CEILING } from '../lib/annual-core-policy.ts';
import { runAutopilot, type AutopilotPortfolio, type ResearchStock } from '../lib/autopilot-engine.ts';
import { researchScoreVerificationReasons } from '../lib/research-score-verification.ts';

export const DEMO_NOW = '2026-06-30T20:05:00.000Z';
export const DEMO_SOURCE = 'Veyro authored synthetic fixture v1';
export const DEMO_PROVENANCE = Object.freeze({ kind: 'synthetic-demo', fixtureVersion: 1, clock: DEMO_NOW,
  description: 'Independently authored fictional companies and artificial USD price paths. No provider capture or private portfolio state.',
  benchmarkNote: 'SPY and QQQ labels identify the comparison slots. Every displayed benchmark price is artificial.' });
const PERIOD = '2025-12-31';
const names = ['Aurora Compute', 'Harbor Networks', 'Cedar Applications', 'Meadow Data', 'Orchid Systems', 'Summit Platform', 'Willow Tools'];
const START = '2026-06-01T16:00:00.000Z';
const priceAt = (ticker: string, index: number) => {
  const initial: Record<string, number> = { DEMO1: 80, DEMO2: 50, DEMO3: 30, DEMO4: 20, DEMO5: 40, DEMO6: 60, DEMO7: 25, SPY: 200, QQQ: 150 };
  const slopes: Record<string, number> = { DEMO1: 0.5, DEMO2: -0.2, DEMO3: -0.15, DEMO4: 0.1, DEMO5: 0.1, DEMO6: 0.1, DEMO7: 0.1, SPY: 0.2, QQQ: 0.1 };
  return Math.round((initial[ticker] + index * slopes[ticker] + Math.sin(index * 0.7) * 0.4) * 100) / 100;
};
export function demoQuote(symbol: string, index: number, asOf: string) {
  return { symbol, price: priceAt(symbol, index), asOf, observedAt: asOf.replace('20:00:', '20:01:'), source: DEMO_SOURCE,
    currency: 'USD', interval: '1d' as '1d' | '5m', adjustmentBasis: 'unadjusted regular-market close', completed: true, closeStatus: 'verified',
    provenance: DEMO_PROVENANCE };
}
export function demoStock(index: number, observedAt = DEMO_NOW, quoteAt = '2026-06-30T20:00:00.000Z') {
  const ticker = `DEMO${index + 1}`;
  const sourceUrl = `https://demo.veyro.invalid/evidence/${ticker}`;
  const price = priceAt(ticker, observedAt.startsWith('2026-06-01') ? 0 : 21);
  const metrics = { revenue_cagr_3y: index < 2 ? 0.42 : 0.15, free_cash_flow_margin: index === 2 ? -0.08 : 0.22,
    net_margin: index === 2 ? -0.12 : 0.20, share_count_cagr_3y: 0.01, free_cash_flow_yield: 0.065,
    net_debt_to_ebitda: 1.1, interest_coverage: 8, operating_margin_change_3y: 0.01 };
  const risks = { freeCashFlowMargin: { value: metrics.free_cash_flow_margin, inputs: [
    { label: 'Synthetic operating cash flow', value: index === 2 ? -70_000_000 : 230_000_000, end: PERIOD, filingUrl: sourceUrl },
    { label: 'Synthetic capital expenditure', value: 10_000_000, end: index === 4 ? '2024-12-31' : PERIOD, filingUrl: sourceUrl }], notes: ['Authored illustration; no actual filing.'] } };
  const annual = { asOfDate: PERIOD, dataBasis: 'annual', sourceUrl, currency: index === 6 ? 'EUR' : 'USD', price,
    financials: { annualRevenue: 1_000_000_000, netMargin: metrics.net_margin }, metrics: { ...metrics, free_cash_flow_margin: index === 3 ? null : metrics.free_cash_flow_margin },
    riskCalculationTraces: risks };
  const company = { ticker, observedAt, annual, quote: { price, asOf: quoteAt, source: DEMO_SOURCE, currency: 'USD', adjustmentBasis: 'unadjusted regular-market close' },
    referenceStock: { exposureScore: 90, aiEvidenceScore: 85, aiEvidence: ['Authored fictional business mechanism for demonstrating evidence presentation.'], dataQuality: 'pass', redFlags: [] } };
  const assessed = assessResearchV2Candidate(company, { weights: ACTIVE_RESEARCH_WEIGHTS, revenueGrowthScoreCeiling: ACTIVE_REVENUE_GROWTH_SCORE_CEILING, minRevenueGrowth: ACTIVE_MIN_REVENUE_GROWTH, profitabilityRequirement: ACTIVE_PROFITABILITY_REQUIREMENT });
  const researchV2 = { ...assessed, version: ACTIVE_RESEARCH_MODEL, scoringRevision: ACTIVE_SCORING_REVISION, portfolioPolicy: ACTIVE_BALANCED_POLICY };
  for (const evidence of Object.values(researchV2.evidence) as Array<{ source: string; sourceUrls: string[] }>) {
    evidence.source = DEMO_SOURCE; evidence.sourceUrls = [sourceUrl];
  }
  if (index === 5) {
    for (const evidence of Object.values(researchV2.evidence) as Array<{ reportingPeriod: string }>) evidence.reportingPeriod = '2023-12-31';
    researchV2.score = null; researchV2.researchRanked = false; researchV2.simulatedBuyEligible = false;
    researchV2.rankReasons = ['Synthetic financial inputs are stale']; researchV2.buyReasons = researchV2.rankReasons;
  }
  const gaps = researchV2.rankReasons;
  return { ticker, name: `${names[index]} (fictional)`, aiTheme: index === 0 ? 'AI compute' : index === 1 ? 'AI networking' : 'AI software',
    asOfDate: PERIOD, filingDate: '2026-02-15', dataBasis: 'annual' as const, financialSourceUrl: sourceUrl,
    currentPrice: price, priceChangePercent: null, priceAsOf: quoteAt, annualRevenue: 1_000_000_000,
    revenueGrowth3y: metrics.revenue_cagr_3y, netMargin: metrics.net_margin, opportunityScore: researchV2.score ?? 0,
    researchV2, qualityScore: index === 2 ? 30 : 85, growthScore: index < 2 ? 90 : 40, confidence: 1,
    signal: index < 2 ? 'Strong opportunity' : 'Review risks', redFlags: index === 2 ? ['Synthetic example: cash flow and net income are negative.'] : [],
    dataQuality: gaps.length ? 'excluded' as const : 'pass' as const, freeCashFlowMargin: index === 3 ? null : metrics.free_cash_flow_margin,
    netDebtToEbitda: 1.1, interestCoverage: 8, shareCountGrowth3y: 0.01, operatingMarginChange3y: 0.01,
    aiEvidence: company.referenceStock.aiEvidence, aiEvidenceScore: 85, exposureScore: 90,
    provenance: DEMO_PROVENANCE, riskCalculationTraces: risks,
    latestReportedFinancials: { status: index === 5 ? 'stale' as const : 'reported_only' as const, periodStart: '2025-01-01', periodEnd: PERIOD,
      basis: 'Authored synthetic annual figures', currency: annual.currency,
      source: { url: sourceUrl, sha256: '0'.repeat(64), observedAt, target: { filed: '2026-02-15', form: 'SYNTHETIC' } },
      figures: [{ label: 'Synthetic revenue', value: 1_000_000_000, unit: annual.currency, start: '2025-01-01', end: PERIOD, scope: 'fictional consolidated entity',
        adjustmentBasis: 'authored unadjusted illustration', sourceUrl, sourceSha256: '0'.repeat(64), observedAt }], limitations: ['All numbers are fictional. Source hash is a placeholder, not a filing digest.'] } };
}
export function generateDemo() {
  const symbols = [...names.map((_, i) => `DEMO${i + 1}`), 'SPY', 'QQQ'];
  const days: string[] = [];
  for (let day = 1; day <= 30; day++) {
    const date = new Date(`2026-06-${String(day).padStart(2, '0')}T20:00:00.000Z`);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) days.push(date.toISOString());
  }
  const snapshots = days.map((asOf, i) => { const quoteEvidence = symbols.map(symbol => demoQuote(symbol, i, asOf));
    return { capturedAt: asOf, marketAsOf: asOf, prices: Object.fromEntries(quoteEvidence.map(q => [q.symbol, q.price])), quoteEvidence }; });
  const entryEvidence = symbols.map(symbol => ({ ...demoQuote(symbol, 0, START), observedAt: START, interval: '5m' as const,
    adjustmentBasis: 'unadjusted regular-market five-minute bar close' }));
  snapshots.unshift({ capturedAt: START, marketAsOf: START, prices: Object.fromEntries(entryEvidence.map(q => [q.symbol, q.price])), quoteEvidence: entryEvidence as typeof snapshots[number]['quoteEvidence'] });
  const quotes = snapshots.at(-1)!.quoteEvidence;
  const stocks = names.map((_, i) => demoStock(i));
  const initialStocks = names.map((_, i) => demoStock(i, START, START));
  const base: AutopilotPortfolio & { id: string; initialCash: number } = { id: 'ai-paper-portfolio', initialCash: 10_000, cash: 10_000, holdings: [], trades: [], watchSymbols: symbols,
    autoTrading: { strategyProfile: 'balanced', enabled: true, maxPositions: 5, maxPositionPercent: 25, stopLossPercent: 18, takeProfitPercent: 50,
      lastRunAt: null, decisions: [], researchRuns: [], loopRuns: [] }, benchmark: { symbol: 'SPY', entryPrice: 200, entryAt: START } };
  // Pure engine, fixed clock/IDs, synthetic inputs only. No scheduler or broker exists.
  const entry = runAutopilot({ portfolio: base, stocks: initialStocks as ResearchStock[], prices: snapshots[0].prices,
    scanGeneratedAt: START, now: START, runKey: 'synthetic-entry-v1' });
  const held = runAutopilot({ portfolio: entry.portfolio, stocks: stocks as ResearchStock[], prices: snapshots.at(-1)!.prices,
    scanGeneratedAt: DEMO_NOW, now: DEMO_NOW, runKey: 'synthetic-hold-v1' });
  const portfolio = { ...base, ...held.portfolio, kind: 'ai-paper-portfolio', createdAt: START, provenance: DEMO_PROVENANCE, snapshots,
    autoTrading: { ...held.portfolio.autoTrading, enabled: false, lastRunAt: DEMO_NOW, loopRuns: [], } };
  const assessedCompanies = stocks.map(stock => ({ ticker: stock.ticker, name: stock.name, status: stock.researchV2.researchRanked ? 'ranked' : 'excluded',
    reason: stock.researchV2.rankReasons.join('; ') || null, researchScore: stock.researchV2.score, latestReportedFinancials: stock.latestReportedFinancials }));
  return { schemaVersion: 1, provenance: DEMO_PROVENANCE,
    scan: { generatedAt: DEMO_NOW, modelVersion: ACTIVE_RESEARCH_MODEL, candidatePoolSize: stocks.length, analysedCount: stocks.length,
      eligibleCount: stocks.filter(s => s.researchV2.researchRanked).length, scannedCount: stocks.length, pricedCount: stocks.length,
      results: stocks.filter(s => s.researchV2.researchRanked), researchUniverse: stocks, assessedCompanies, errors: [],
      methodology: 'Synthetic demonstration of the retained annual-core scoring policy. Seven fictional companies include profitable, loss-making, missing, stale, period-mismatched and currency-mismatched inputs.',
      priceNote: 'Artificial USD prices at a frozen clock. No market data provider is connected.', priceSource: DEMO_SOURCE, provenance: DEMO_PROVENANCE },
    portfolio, quotes, snapshots,
    dailyCloses: snapshots.flatMap(s => s.quoteEvidence.map(q => ({ ...q, marketDay: q.asOf.slice(0,10), rawClose: q.price, adjustedClose: q.price, marketAsOf: q.asOf }))),
    checks: stocks.map(stock => ({ ticker: stock.ticker, reasons: researchScoreVerificationReasons(stock, DEMO_NOW, DEMO_NOW) })) };
}
export type DemoState = ReturnType<typeof generateDemo>;
