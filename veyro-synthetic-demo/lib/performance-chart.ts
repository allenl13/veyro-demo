import { normaliseReturn } from "./financial-metrics.ts";
import { marketDay, newYorkClock, regularSessionQuote, snapshotTime } from "./market-time.ts";

export type PerformanceTrade = {
  side: "buy" | "sell";
  ticker: string;
  shares: number;
  price: number;
  value: number;
  createdAt: string;
};

export type PerformanceHolding = {
  ticker: string;
  shares: number;
  averageCost: number;
};

export type PerformanceSnapshot = {
  capturedAt: string;
  marketAsOf: string;
  prices: Record<string, number>;
  quoteEvidence?: Array<{symbol: string; price: number; asOf: string; observedAt: string; source: string; currency: string; interval: string; adjustmentBasis: string; completed?: boolean; closeStatus?: string}>;
};

/** A complete, aligned display bundle may update the chart without rewriting saved observations. */
export function latestPortfolioChartSnapshot(quotes: unknown, symbols: string[], now = Date.now()): PerformanceSnapshot | null {
  if (!Array.isArray(quotes) || !symbols.length) return null;
  const requested = [...new Set(symbols)];
  const selected = quotes.filter((quote) => requested.includes(quote?.symbol));
  if (selected.length !== requested.length || new Set(selected.map((q) => q.symbol)).size !== requested.length) return null;
  const asOf = selected[0].asOf;
  const interval = selected[0].interval;
  if (!selected.every((q) => q.asOf === asOf && q.interval === interval && Number.isFinite(q.price) && q.price > 0
    && q.source === "Veyro authored synthetic fixture v1" && q.currency === "USD"
    && Number.isFinite(Date.parse(q.asOf)) && Date.parse(q.asOf) <= now && regularSessionQuote(new Date(q.asOf))
    && Number.isFinite(Date.parse(q.observedAt)) && Date.parse(q.observedAt) <= now + 30_000
    && ((q.interval === "1d" && q.closeStatus === "verified" && q.adjustmentBasis === "unadjusted regular-market close")
      || (q.interval === "5m" && q.adjustmentBasis === "unadjusted regular-market five-minute bar close")))) return null;
  return {capturedAt: selected.reduce((latest, q) => Date.parse(q.observedAt) > Date.parse(latest) ? q.observedAt : latest, selected[0].observedAt),
    marketAsOf: asOf, prices: Object.fromEntries(selected.map((q) => [q.symbol, q.price])), quoteEvidence: selected};
}

export function mergePortfolioChartSnapshots(history: PerformanceSnapshot[], stored: PerformanceSnapshot[], entry: PerformanceSnapshot | null, display: PerformanceSnapshot | null) {
  const entryTime = entry ? snapshotTime(entry) : -Infinity;
  const merged = new Map<string, PerformanceSnapshot>();
  for (const snapshot of [...history, ...stored, ...(display ? [display] : [])]) {
    if (snapshotTime(snapshot) <= entryTime) continue;
    const key = snapshot.marketAsOf || snapshot.capturedAt;
    const previous = merged.get(key);
    merged.set(key, previous ? {...snapshot, prices: {...previous.prices, ...snapshot.prices}, quoteEvidence: [
      ...(previous.quoteEvidence ?? []).filter(q => !(q.symbol in snapshot.prices)),
      ...(snapshot.quoteEvidence ?? []),
    ]} : snapshot);
  }
  const recorded = [...merged.values()].sort((left, right) => snapshotTime(left) - snapshotTime(right));
  return entry ? [entry, ...recorded] : recorded;
}

/** Anchor one calendar month to the latest New York market day, independent of the viewer's clock. */
export function calendarMonthChartSnapshots(snapshots: PerformanceSnapshot[]) {
  if (!snapshots.length) return [];
  const endDay = marketDay(snapshots.at(-1)!.marketAsOf || snapshots.at(-1)!.capturedAt);
  const [year, month, date] = endDay.split("-").map(Number);
  if (![year, month, date].every(Number.isFinite)) return [];
  const target = new Date(Date.UTC(year, month - 2, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  const cutoffDay = target.toISOString().slice(0, 10);
  let start = 0;
  for (const [index, snapshot] of snapshots.entries()) {
    if (marketDay(snapshot.marketAsOf || snapshot.capturedAt) <= cutoffDay) start = index;
  }
  return snapshots.slice(start);
}

/** Keep the inception point, then one final regular-session observation per New York trading day. */
export function dailyClosingSnapshots(snapshots: PerformanceSnapshot[]) {
  const baseline = snapshots[0];
  if (!baseline) return [];
  const closingByDay = new Map<string, PerformanceSnapshot>();
  for (const snapshot of snapshots) {
    const timestamp = new Date(snapshotTime(snapshot));
    const { weekday, minutes } = newYorkClock(timestamp);
    if (
      !["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday) ||
      minutes < 570 ||
      minutes > 960
    ) {
      continue;
    }
    closingByDay.set(marketDay(snapshot.marketAsOf || snapshot.capturedAt), snapshot);
  }
  const closes = [...closingByDay.values()]
    .sort((left, right) => snapshotTime(left) - snapshotTime(right))
    .filter((snapshot) => snapshotTime(snapshot) > snapshotTime(baseline));
  return [baseline, ...closes];
}

type ChartHistoryPortfolio = {
  id: string;
  holdings: Pick<PerformanceHolding, "ticker">[];
  trades: Pick<PerformanceTrade, "side" | "ticker" | "createdAt">[];
};

/** Identifies the market history needed by a portfolio chart, independent of quote and snapshot updates. */
export function portfolioChartHistoryIdentity(portfolio: ChartHistoryPortfolio, benchmark: string | readonly string[]) {
  const symbolsKey = [...new Set([
    ...portfolio.holdings.map((holding) => holding.ticker),
    ...portfolio.trades.map((trade) => trade.ticker),
    ...(typeof benchmark === "string" ? [benchmark] : benchmark),
  ])].sort().join(",");
  const firstBuyAt = portfolio.trades
    .filter((trade) => trade.side === "buy")
    .map((trade) => trade.createdAt)
    .sort()[0] ?? "";
  return {
    symbolsKey,
    cacheKey: `${portfolio.id}|${firstBuyAt}|${symbolsKey}`,
  };
}

export type BenchmarkAdjustmentEvidence = {
  symbol: string;
  marketAsOf: string;
  marketDay: string;
  rawClose: number;
  adjustedClose: number;
  source: string;
  adjustmentBasis: string;
  completed: boolean;
};

export type BenchmarkChartPoint = {
  marketDay: string;
  rawClose: number;
};

type StrategyValueInput = {
  initialCash: number;
  currentCash: number;
  currentHoldings: PerformanceHolding[];
  trades: PerformanceTrade[];
  asOf: number;
  prices: Record<string, number>;
};

type ReconstructedHolding = {
  shares: number;
  fallbackPrice: number;
};

function validTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Infinity;
}

/** Use only the prices that were actually paid at the first trade timestamp. */
export function inceptionTradePrices(trades: PerformanceTrade[]) {
  const ordered = [...trades]
    .filter((trade) => Number.isFinite(validTime(trade.createdAt)))
    .sort((left, right) => validTime(left.createdAt) - validTime(right.createdAt));
  const firstTime = ordered.length ? validTime(ordered[0].createdAt) : null;
  if (firstTime === null) return {};
  return Object.fromEntries(
    ordered
      .filter((trade) => validTime(trade.createdAt) === firstTime)
      .map((trade) => [trade.ticker, trade.price]),
  );
}

/**
 * Return verified per-day SPY adjustment factors. Incomplete, malformed or
 * conflicting evidence is excluded rather than silently changing a return.
 */
export function completedBenchmarkAdjustmentFactors(
  evidence: BenchmarkAdjustmentEvidence[],
) {
  const factors = new Map<string, number>();
  const closes = new Map<string, { rawClose: number; adjustedClose: number }>();
  const conflicted = new Set<string>();
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  let unidentifiableInvalidEvidence = false;
  for (const item of evidence) {
    const suppliedDay = typeof item?.marketDay === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.marketDay)
      ? item.marketDay
      : null;
    const parsedAsOf = typeof item?.marketAsOf === "string"
      ? Date.parse(item.marketAsOf)
      : NaN;
    const derivedDay = Number.isFinite(parsedAsOf)
      ? dayFormatter.format(new Date(parsedAsOf))
      : null;
    const identifiableDay = suppliedDay ?? derivedDay;
    const invalid =
      item?.completed !== true ||
      item.symbol !== "SPY" ||
      item.source !== "Veyro authored synthetic fixture v1" ||
      item.adjustmentBasis !== "dividend-and-split-adjusted close" ||
      suppliedDay === null ||
      typeof item.rawClose !== "number" ||
      !Number.isFinite(item.rawClose) ||
      !(item.rawClose > 0) ||
      typeof item.adjustedClose !== "number" ||
      !Number.isFinite(item.adjustedClose) ||
      !(item.adjustedClose > 0) ||
      typeof item.marketAsOf !== "string" ||
      !Number.isFinite(parsedAsOf) ||
      new Date(item.marketAsOf).toISOString() !== item.marketAsOf ||
      derivedDay !== item.marketDay;
    if (invalid) {
      if (identifiableDay) {
        factors.delete(identifiableDay);
        closes.delete(identifiableDay);
        conflicted.add(identifiableDay);
      } else {
        unidentifiableInvalidEvidence = true;
      }
      continue;
    }
    if (conflicted.has(item.marketDay)) continue;
    const previousCloses = closes.get(item.marketDay);
    if (
      previousCloses &&
      (previousCloses.rawClose !== item.rawClose ||
        previousCloses.adjustedClose !== item.adjustedClose)
    ) {
      factors.delete(item.marketDay);
      closes.delete(item.marketDay);
      conflicted.add(item.marketDay);
      continue;
    }
    const factor = item.adjustedClose / item.rawClose;
    if (!Number.isFinite(factor) || factor <= 0) continue;
    closes.set(item.marketDay, {
      rawClose: item.rawClose,
      adjustedClose: item.adjustedClose,
    });
    factors.set(item.marketDay, factor);
  }
  return unidentifiableInvalidEvidence ? new Map<string, number>() : factors;
}

/** Select one benchmark basis for the entire displayed period. */
export function basisConsistentBenchmarkSeries(
  points: BenchmarkChartPoint[],
  adjustmentFactors: Map<string, number>,
) {
  const adjusted = points.length > 0 && points.every(
    (point) => adjustmentFactors.has(point.marketDay),
  );
  const values = points.map((point) =>
    point.rawClose * (adjusted ? (adjustmentFactors.get(point.marketDay) ?? 1) : 1));
  const start = values[0] ?? 1;
  return {
    basis: adjusted ? "total-return" as const : "price" as const,
    values,
    returns: values.map((value) => rebasedReturn(value, start)),
  };
}

/** Compare price returns on the same visible period, using the prior close for 1D. */
export function portfolioChartSeries({
  portfolio,
  displaySnapshots,
  snapshots,
  selectedTicker,
  range,
  benchmark = "SPY",
}: {
  portfolio: {
    initialCash: number;
    cash: number;
    holdings: PerformanceHolding[];
    trades: PerformanceTrade[];
  };
  displaySnapshots: PerformanceSnapshot[];
  snapshots: PerformanceSnapshot[];
  selectedTicker: string | null;
  range: "1D" | "5D" | "1M" | "Max";
  benchmark?: string;
}) {
  const portfolioValue = (snapshot: PerformanceSnapshot) =>
    strategyValueAtSnapshot({
      initialCash: portfolio.initialCash,
      currentCash: portfolio.cash,
      currentHoldings: portfolio.holdings,
      trades: portfolio.trades,
      asOf: snapshotTime(snapshot),
      prices: snapshot.prices,
    });
  const firstSnapshot = displaySnapshots[0];
  const holding = selectedTicker
    ? portfolio.holdings.find((item) => item.ticker === selectedTicker)
    : null;
  const pointValues = selectedTicker
    ? displaySnapshots.map(
        (snapshot) =>
          snapshot.prices[selectedTicker] ?? holding?.averageCost ?? 0,
      )
    : displaySnapshots.map(portfolioValue);
  const visibleMarketDay = firstSnapshot
    ? marketDay(firstSnapshot.marketAsOf || firstSnapshot.capturedAt)
    : "";
  const previousCloseSnapshot = range === "1D" && visibleMarketDay
    ? [...snapshots]
        .filter(
          (snapshot) =>
            marketDay(snapshot.marketAsOf || snapshot.capturedAt) <
            visibleMarketDay,
        )
        .sort((left, right) => snapshotTime(left) - snapshotTime(right))
        .at(-1)
    : null;
  const pointStart = previousCloseSnapshot
    ? selectedTicker
      ? previousCloseSnapshot.prices[selectedTicker] ?? pointValues[0] ?? 1
      : portfolioValue(previousCloseSnapshot)
    : pointValues[0] || 1;
  const series = pointValues.map((value) => rebasedReturn(value, pointStart));
  const benchmarkBaselineSnapshot = previousCloseSnapshot ?? firstSnapshot;
  const benchmarkStartRaw = benchmarkBaselineSnapshot?.prices[benchmark] ?? 1;
  const benchmarkPoints = [benchmarkBaselineSnapshot, ...displaySnapshots]
    .filter((snapshot): snapshot is PerformanceSnapshot => Boolean(snapshot))
    .map((snapshot) => ({
      marketDay: marketDay(snapshot.marketAsOf || snapshot.capturedAt),
      rawClose: snapshot.prices[benchmark] ?? benchmarkStartRaw,
    }));
  // The simulated portfolio does not credit dividends. Use raw benchmark
  // prices too, regardless of adjustment evidence retained in the history feed.
  const benchmarkPrices = benchmarkPoints.map((point) => point.rawClose);
  const benchmarkStart = benchmarkPrices[0] ?? 1;
  const benchmarkReturns = benchmarkPrices.map((price) => rebasedReturn(price, benchmarkStart));
  const benchmarkValues = benchmarkPrices.slice(1);
  const benchmarkLabel = `${benchmark} price return`;
  return {
    series,
    benchmark: benchmarkReturns.slice(1),
    pointValues,
    pointStart,
    benchmarkValues,
    benchmarkLabel,
  };
}

function positionValue(
  holdings: Iterable<[string, ReconstructedHolding]>,
  prices: Record<string, number>,
) {
  let value = 0;
  for (const [ticker, holding] of holdings) {
    if (!(holding.shares > 0)) continue;
    const marketPrice = prices[ticker];
    value += holding.shares * (
      Number.isFinite(marketPrice) && marketPrice > 0
        ? marketPrice
        : holding.fallbackPrice
    );
  }
  return value;
}

/**
 * Values the strategy using only trades that had occurred at the snapshot.
 * Once every recorded trade is in scope, the persisted current cash and share
 * counts are used so the full-history endpoint reconciles exactly with the
 * authoritative strategy summary.
 */
export function strategyValueAtSnapshot(input: StrategyValueInput) {
  const trades = [...input.trades].sort(
    (left, right) => validTime(left.createdAt) - validTime(right.createdAt),
  );
  const applicable = trades.filter((trade) => validTime(trade.createdAt) <= input.asOf);

  if (applicable.length === trades.length) {
    return input.currentCash + input.currentHoldings.reduce((sum, holding) => {
      const marketPrice = input.prices[holding.ticker];
      return sum + holding.shares * (
        Number.isFinite(marketPrice) && marketPrice > 0
          ? marketPrice
          : holding.averageCost
      );
    }, 0);
  }

  let cash = input.initialCash;
  const holdings = new Map<string, ReconstructedHolding>();
  for (const trade of applicable) {
    const value = Number.isFinite(trade.value) && trade.value > 0
      ? trade.value
      : trade.shares * trade.price;
    const current = holdings.get(trade.ticker) ?? {
      shares: 0,
      fallbackPrice: trade.price,
    };
    if (trade.side === "buy") {
      cash -= value;
      holdings.set(trade.ticker, {
        shares: current.shares + trade.shares,
        fallbackPrice: trade.price,
      });
    } else {
      cash += value;
      holdings.set(trade.ticker, {
        shares: Math.max(0, current.shares - trade.shares),
        fallbackPrice: trade.price,
      });
    }
  }
  return cash + positionValue(holdings, input.prices);
}

/** Select exactly the latest five available trading-session points. */
export function latestFiveTradingSessions<T>(snapshots: T[]) {
  return snapshots.slice(-5);
}

type TimeSeriesSelector<T> = {
  timestamp: (point: T) => number;
  sessionKey: (point: T) => string;
  isRegularMarketPoint: (point: T) => boolean;
};

/**
 * Add genuine recent intraday observations to a daily-close range without
 * changing that range's existing start or end point. The daily close wins for
 * duplicate timestamps, so the chart keeps its established period endpoints.
 */
export function enrichDailySnapshotsWithIntraday<T>(
  dailyRange: T[],
  availableSnapshots: T[],
  selector: TimeSeriesSelector<T>,
) {
  const dailyPoints = dailyRange.filter((point) => {
    const timestamp = selector.timestamp(point);
    return Number.isFinite(timestamp) && selector.sessionKey(point).length > 0;
  });
  if (dailyPoints.length < 2) return dailyPoints;

  const start = selector.timestamp(dailyPoints[0]);
  const end = selector.timestamp(dailyPoints.at(-1)!);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return dailyPoints;

  const selectedSessions = new Set(dailyPoints.map(selector.sessionKey));
  const pointsByTimestamp = new Map<number, T>();
  for (const point of availableSnapshots) {
    const timestamp = selector.timestamp(point);
    if (
      !Number.isFinite(timestamp) ||
      timestamp < start ||
      timestamp > end ||
      !selectedSessions.has(selector.sessionKey(point)) ||
      !selector.isRegularMarketPoint(point)
    ) {
      continue;
    }
    pointsByTimestamp.set(timestamp, point);
  }

  // Preserve the pre-existing daily close values at the shared endpoints.
  for (const point of dailyPoints) pointsByTimestamp.set(selector.timestamp(point), point);
  return [...pointsByTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}

/**
 * Thin an irregular time series by elapsed time, rather than by array index.
 * That keeps the older daily observations visible when recent intraday points
 * are available, and it never synthesises a value between observations.
 */
export function sampleTimeSeries<T>(
  points: T[],
  maximum: number,
  timestamp: (point: T) => number,
) {
  if (points.length <= maximum || maximum < 2) return points;
  const first = timestamp(points[0]);
  const last = timestamp(points.at(-1)!);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return points.slice(0, maximum - 1).concat(points.at(-1)!);
  }

  const selected: T[] = [];
  let sourceIndex = 0;
  for (let index = 0; index < maximum; index++) {
    const target = first + ((last - first) * index) / (maximum - 1);
    while (
      sourceIndex + 1 < points.length &&
      Math.abs(timestamp(points[sourceIndex + 1]) - target) <= Math.abs(timestamp(points[sourceIndex]) - target)
    ) {
      sourceIndex += 1;
    }
    const point = points[sourceIndex];
    if (selected.at(-1) !== point) selected.push(point);
  }
  if (selected.at(-1) !== points.at(-1)) {
    if (selected.length >= maximum) selected[selected.length - 1] = points.at(-1)!;
    else selected.push(points.at(-1)!);
  }
  return selected;
}

/** Rebase one raw value against the selected range's raw starting value. */
export function rebasedReturn(value: number, startValue: number) {
  return value / startValue - 1;
}

/**
 * Derive the portfolio-only dollar change from the same raw endpoints used by
 * the chart return. Ticker views deliberately return no portfolio amount.
 */
export function portfolioChartValueChange(
  selectedTicker: string | null,
  startValue: number | null | undefined,
  endValue: number | null | undefined,
) {
  if (
    selectedTicker !== null ||
    typeof startValue !== "number" ||
    !Number.isFinite(startValue) ||
    !(startValue > 0) ||
    typeof endValue !== "number" ||
    !Number.isFinite(endValue)
  ) {
    return null;
  }
  const change = endValue - startValue;
  return Object.is(change, -0) ? 0 : change;
}

export type PortfolioChartMovement = {
  valueChange: number;
  returnValue: number;
  periodLabel: "today" | "1W" | "1M" | "All";
};

/**
 * Project the portfolio movement shown outside the chart from one shared pair
 * of chart endpoints. Ticker views deliberately expose no portfolio movement.
 */
export function portfolioChartMovement(
  selectedTicker: string | null,
  startValue: number | null | undefined,
  endValue: number | null | undefined,
  periodLabel: PortfolioChartMovement["periodLabel"],
): PortfolioChartMovement | null {
  const valueChange = portfolioChartValueChange(selectedTicker, startValue, endValue);
  if (valueChange === null || typeof startValue !== "number" || typeof endValue !== "number") {
    return null;
  }
  return {
    valueChange,
    returnValue: normaliseReturn(rebasedReturn(endValue, startValue)),
    periodLabel,
  };
}

export function formatRebasedReturn(value: number) {
  const scaled = normaliseReturn(value) * 100;
  const rounded = Math.abs(scaled) < 0.0005 ? 0 : scaled;
  if (rounded === 0) return "0.00%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}%`;
}

/** Place session-based observations at equal horizontal steps. */
export function sessionStepPosition(index: number, length: number) {
  if (length <= 1) return 0.5;
  return Math.max(0, Math.min(1, index / (length - 1)));
}

/** Place an observation proportionally within an observed time range. */
export function timeSeriesPosition(timestamp: number, start: number, end: number) {
  if (!Number.isFinite(timestamp) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (timestamp - start) / (end - start)));
}

/** Place an intraday observation within the 9:30am-4:00pm New York session. */
export function intradaySessionPosition(minutesSinceMidnight: number) {
  return Math.max(0, Math.min(1, (minutesSinceMidnight - 570) / 390));
}

/** Pick labels from real observations rather than synthesising calendar dates. */
export function sessionTickIndices(length: number, maximumTicks: number) {
  if (length <= 0 || maximumTicks <= 0) return [];
  if (length <= maximumTicks) return Array.from({ length }, (_, index) => index);
  return [...new Set(
    Array.from(
      { length: maximumTicks },
      (_, index) => Math.round((index / (maximumTicks - 1)) * (length - 1)),
    ),
  )];
}


export type ReturnChartScale = { low: number; high: number; step: number; ticks: number[] };

/** One labelled scale for both return series; no forced symmetry or stale extremes. */
export function sharedReturnScale(values: number[]): ReturnChartScale {
  const finite = values.filter(Number.isFinite);
  const minimum = Math.min(0, ...finite);
  const maximum = Math.max(0, ...finite);
  const span = Math.max(0.0004, maximum - minimum);
  const padding = span * 0.08;
  const rawStep = (span + padding * 2) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power;
  const firstTick = Math.floor((minimum - padding) / step);
  const lastTick = Math.ceil((maximum + padding) / step);
  const ticks = Array.from({ length: lastTick - firstTick + 1 }, (_, index) => {
    const tick = (firstTick + index) * step;
    return Math.abs(tick) < step / 1000 ? 0 : tick;
  });
  return { low: ticks[0], high: ticks.at(-1)!, step, ticks };
}

/** Shared by rendering and pointer selection, including non-default canvas heights. */
export function returnChartY(value: number, scale: ReturnChartScale, height: number) {
  return 18 + (scale.high - value) / (scale.high - scale.low) * (height - 30);
}

export function formatReturnAxisTick(value: number, step: number) {
  const decimals = Math.min(4, Math.max(1, Math.ceil(-Math.log10(step * 100)) + 1));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(decimals)}%`;
}
