import { marketDay, newYorkClock, regularSessionQuote, snapshotTime } from './market-time.ts';
import { sampleTimeSeries, portfolioChartSeries, formatRebasedReturn, type PerformanceSnapshot, type PerformanceHolding, type PerformanceTrade } from './performance-chart.ts';

export const CHART_BENCHMARKS = ['QQQ', 'SPY'] as const;
export type ChartBenchmark = (typeof CHART_BENCHMARKS)[number];
export const BENCHMARK_PREFERENCE_KEY = 'veyro.demo.chart-benchmark.v1';
export const BENCHMARK_NAMES = {QQQ: 'Nasdaq-100 ETF', SPY: 'S&P 500 ETF'} as const;
export function chartBenchmarkPreference(value: unknown): ChartBenchmark { return value === 'SPY' ? 'SPY' : 'QQQ'; }

type ChartAccount = {initialCash: number; cash: number; holdings: PerformanceHolding[]; trades: PerformanceTrade[]};
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Determine the real positions at a historical point; future purchases cannot require prior prices. */
export function chartPositionSymbols(portfolio: ChartAccount, asOf: number) {
  const applicable = portfolio.trades.filter(t => Date.parse(t.createdAt) <= asOf);
  if (applicable.length === portfolio.trades.length) return portfolio.holdings.filter(h => h.shares > 0).map(h => h.ticker);
  const shares = new Map<string, number>();
  for (const t of [...applicable].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt))) {
    shares.set(t.ticker, (shares.get(t.ticker) ?? 0) + (t.side === 'buy' ? t.shares : -t.shares));
  }
  return [...shares].filter(([,v]) => v > 1e-8).map(([s]) => s);
}

/** A price cannot be forward-filled, converted, adjusted, or marked with another symbol's time. */
export function verifiedChartPrice(snapshot: PerformanceSnapshot, symbol: string, now = Date.now()) {
  const time = snapshotTime(snapshot), matches = (snapshot.quoteEvidence ?? []).filter(q => q.symbol === symbol);
  if (matches.length !== 1 || !Number.isFinite(time) || time > now || !regularSessionQuote(new Date(time))) return false;
  const q = matches[0], observed = Date.parse(q.observedAt);
  return positive(snapshot.prices[symbol]) && q.price === snapshot.prices[symbol]
    && q.source === 'Veyro authored synthetic fixture v1' && q.currency === 'USD' && Date.parse(q.asOf) === time
    && Number.isFinite(observed) && observed >= time && observed <= now + 30_000
    && ((q.interval === '1d' && q.adjustmentBasis === 'unadjusted regular-market close' && (q.completed === true || q.closeStatus === 'verified'))
      || (q.interval === '1m' && q.adjustmentBasis === 'unadjusted regular-market minute close' && q.completed === true)
      || (q.interval === '5m' && q.adjustmentBasis === 'unadjusted regular-market five-minute bar close'));
}

export function alignedBenchmarkSnapshots(snapshots: PerformanceSnapshot[], portfolio: ChartAccount, selectedTicker: string | null, benchmark: ChartBenchmark, now = Date.now()) {
  return snapshots.filter(s => {
    const symbols = selectedTicker ? [selectedTicker] : chartPositionSymbols(portfolio, snapshotTime(s));
    return [...symbols, benchmark].every(symbol => verifiedChartPrice(s, symbol, now));
  });
}

export type SummaryBenchmarkComparison = {
  benchmark: ChartBenchmark;
  status: 'since-start' | 'matched-period' | 'unavailable';
  requestedStartAt: string | null;
  baselineAt: string | null;
  endAt: string | null;
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  observedAt: string | null;
  source: 'Veyro authored synthetic fixture v1';
  currency: 'USD';
  adjustmentBasis: 'unadjusted regular-market price return';
};

/** Summary comparisons are independent of the selected chart range and ETF. */
export function sinceStartBenchmarkComparisons(portfolio: ChartAccount, snapshots: PerformanceSnapshot[], now = Date.now()): SummaryBenchmarkComparison[] {
  const firstBuyAt = portfolio.trades.filter(t => t.side === 'buy').map(t => Date.parse(t.createdAt)).filter(Number.isFinite).sort((a,b) => a-b)[0];
  return CHART_BENCHMARKS.map(benchmark => {
    const empty: SummaryBenchmarkComparison = {benchmark, status:'unavailable', requestedStartAt:Number.isFinite(firstBuyAt) ? new Date(firstBuyAt).toISOString() : null,
      baselineAt:null, endAt:null, portfolioReturn:null, benchmarkReturn:null, excessReturn:null, observedAt:null,
      source:'Veyro authored synthetic fixture v1', currency:'USD', adjustmentBasis:'unadjusted regular-market price return'};
    if (!Number.isFinite(firstBuyAt)) return empty;
    const common = alignedBenchmarkSnapshots(snapshots, portfolio, null, benchmark, now)
      .filter(s => snapshotTime(s) >= firstBuyAt).sort((a,b) => snapshotTime(a)-snapshotTime(b));
    const first = common[0], last = common.at(-1);
    if (!first || !last || snapshotTime(last) <= snapshotTime(first)) return empty;
    const values = portfolioChartSeries({portfolio, snapshots:[], displaySnapshots:[first,last], selectedTicker:null, benchmark, range:'Max'});
    const portfolioReturn = values.series.at(-1), benchmarkReturn = values.benchmark.at(-1);
    if (!positive(values.pointStart) || !positive(values.pointValues.at(-1)) || !Number.isFinite(portfolioReturn) || !Number.isFinite(benchmarkReturn)) return empty;
    const observedAt = [first,last].flatMap(s => (s.quoteEvidence ?? []).map(q => q.observedAt)).sort().at(-1) ?? null;
    return {...empty, status:snapshotTime(first) === firstBuyAt ? 'since-start' : 'matched-period', baselineAt:new Date(snapshotTime(first)).toISOString(), endAt:new Date(snapshotTime(last)).toISOString(),
      portfolioReturn:portfolioReturn!, benchmarkReturn:benchmarkReturn!, excessReturn:portfolioReturn!-benchmarkReturn!, observedAt};
  });
}

export function summaryBenchmarkReturnDifference(comparison: SummaryBenchmarkComparison, totalReturn: number | null) {
  const start = Date.parse(comparison.baselineAt ?? ''), end = Date.parse(comparison.endAt ?? '');
  if (comparison.status === 'unavailable' || comparison.benchmarkReturn === null || !Number.isFinite(comparison.benchmarkReturn)
    || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || totalReturn === null || !Number.isFinite(totalReturn)) return null;
  // This summary uses the account's reported return from initial cash.
  // The selected-period chart retains its own aligned and rebased calculation.
  return totalReturn - comparison.benchmarkReturn;
}

export function summaryBenchmarkComparisonText(comparison: SummaryBenchmarkComparison, totalReturn: number | null) {
  const difference = summaryBenchmarkReturnDifference(comparison, totalReturn);
  if (difference === null) return `${comparison.benchmark} comparison unavailable`;
  const relative = Math.abs(difference) < 0.00005 ? 'In line'
    : `${difference > 0 ? 'Ahead' : 'Behind'} by ${(Math.abs(difference)*100).toFixed(2)} percentage points`;
  return `${comparison.benchmark} price return (excl. dividends) ${formatRebasedReturn(comparison.benchmarkReturn!)} · ${relative}`;
}

/** Both curves use exactly the same points and baseline; partial coverage is explicit. */
export function pairedBenchmarkChart({portfolio, snapshots, visibleSnapshots, selectedTicker, benchmark, range, now = Date.now()}: {
  portfolio: ChartAccount; snapshots: PerformanceSnapshot[]; visibleSnapshots: PerformanceSnapshot[];
  selectedTicker: string | null; benchmark: ChartBenchmark; range: '1D'|'5D'|'1M'|'Max'; now?: number;
}) {
  const verified = alignedBenchmarkSnapshots(visibleSnapshots, portfolio, selectedTicker, benchmark, now);
  const common = sampleTimeSeries(verified, range === "1D" ? 96 : 180, snapshotTime);
  const allCommon = alignedBenchmarkSnapshots(snapshots, portfolio, selectedTicker, benchmark, now);
  const first = common[0];
  const previousCloses = first && range === '1D' ? allCommon.filter(s => marketDay(s.marketAsOf) < marketDay(first.marketAsOf)
    && (newYorkClock(new Date(snapshotTime(s))).minutes === 960 || s.quoteEvidence?.some(q => q.interval === '1d'))) : [];
  const values = portfolioChartSeries({portfolio, snapshots: previousCloses, displaySnapshots: common, selectedTicker, benchmark, range});
  const excluded = visibleSnapshots.length - verified.length;
  const start = previousCloses.at(-1) ?? first;
  const end = common.at(-1);
  return {...values, displaySnapshots: common, baselineAt: start?.marketAsOf ?? null, endAt: end?.marketAsOf ?? null,
    excluded, missingPreviousClose: Boolean(first && range === '1D' && !previousCloses.length),
    unavailable: !common.length,
    // Costs/cash are valued by the existing ledger function; no synthetic ETF holding or trade is created.
    observationAt: end?.quoteEvidence?.map(q => q.observedAt).sort().at(-1) ?? null};
}
