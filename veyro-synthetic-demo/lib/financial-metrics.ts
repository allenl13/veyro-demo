const DISPLAY_ZERO_THRESHOLD = 0.00005;

function validPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function normaliseReturn(value: number, threshold = DISPLAY_ZERO_THRESHOLD) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) < threshold ? 0 : value;
}

export function calculateReturn(
  currentValue: number | null | undefined,
  baselineValue: number | null | undefined,
) {
  if (!validPositive(currentValue) || !validPositive(baselineValue)) return null;
  return normaliseReturn(currentValue / baselineValue - 1);
}

export function compareWithBenchmark(input: {
  portfolioCurrentValue: number | null | undefined;
  portfolioBaselineValue: number | null | undefined;
  benchmarkCurrentPrice: number | null | undefined;
  benchmarkBaselinePrice: number | null | undefined;
}) {
  const portfolioReturn = calculateReturn(
    input.portfolioCurrentValue,
    input.portfolioBaselineValue,
  );
  const benchmarkReturn = calculateReturn(
    input.benchmarkCurrentPrice,
    input.benchmarkBaselinePrice,
  );
  return {
    portfolioReturn,
    benchmarkReturn,
    excessReturn:
      portfolioReturn === null || benchmarkReturn === null
        ? null
        : normaliseReturn(portfolioReturn - benchmarkReturn),
  };
}

type InvestedHolding = {
  ticker: string;
  shares: number;
  averageCost: number;
};

type InvestmentTrade = {
  side: "buy" | "sell";
  ticker: string;
  shares: number;
  price: number;
  createdAt: string;
};

type BenchmarkObservation = {
  capturedAt: string;
  marketAsOf: string;
  prices: Record<string, number>;
};

const BENCHMARK_MATCH_WINDOW_MS = 20 * 60 * 1000;

function observationTime(observation: BenchmarkObservation) {
  return Date.parse(observation.marketAsOf || observation.capturedAt);
}

export function compareInvestedHoldingsWithBenchmark(input: {
  holdings: InvestedHolding[];
  trades: InvestmentTrade[];
  currentPrices: Record<string, number | null | undefined>;
  benchmarkCurrentPrice: number | null | undefined;
  benchmarkSnapshots: BenchmarkObservation[];
  benchmarkEntry?: {
    entryPrice: number;
    entryAt: string;
  };
  benchmarkSymbol?: string;
}) {
  const benchmarkSymbol = input.benchmarkSymbol ?? "SPY";
  const validHoldings = input.holdings.filter(
    (holding) =>
      validPositive(holding.shares) && validPositive(holding.averageCost),
  );
  const investedCostBasis = validHoldings.reduce(
    (sum, holding) => sum + holding.shares * holding.averageCost,
    0,
  );
  const hasAllCurrentPrices = validHoldings.every((holding) =>
    validPositive(input.currentPrices[holding.ticker]),
  );
  const investedCurrentValue =
    validHoldings.length && hasAllCurrentPrices
      ? validHoldings.reduce(
          (sum, holding) =>
            sum + holding.shares * input.currentPrices[holding.ticker]!,
          0,
        )
      : null;
  const holdingsReturn = calculateReturn(
    investedCurrentValue,
    investedCostBasis,
  );

  const observations = input.benchmarkSnapshots.flatMap((snapshot) => {
    const price = snapshot.prices[benchmarkSymbol];
    const timestamp = observationTime(snapshot);
    return validPositive(price) && Number.isFinite(timestamp)
      ? [{ price, timestamp }]
      : [];
  });
  if (
    input.benchmarkEntry &&
    validPositive(input.benchmarkEntry.entryPrice)
  ) {
    const timestamp = Date.parse(input.benchmarkEntry.entryAt);
    if (Number.isFinite(timestamp)) {
      observations.push({
        price: input.benchmarkEntry.entryPrice,
        timestamp,
      });
    }
  }

  const findBenchmarkEntry = (createdAt: string) => {
    const tradeTime = Date.parse(createdAt);
    if (!Number.isFinite(tradeTime)) return null;
    const closest = observations.reduce<
      { price: number; timestamp: number } | undefined
    >((best, observation) => {
      if (!best) return observation;
      return Math.abs(observation.timestamp - tradeTime) <
        Math.abs(best.timestamp - tradeTime)
        ? observation
        : best;
    }, undefined);
    return closest &&
      Math.abs(closest.timestamp - tradeTime) <= BENCHMARK_MATCH_WINDOW_MS
      ? closest.price
      : null;
  };

  let matchedBenchmarkCurrentValue = 0;
  let matchedCostBasis = 0;
  let allPositionsMatched = validHoldings.length > 0;
  for (const holding of validHoldings) {
    const lots: Array<{
      shares: number;
      createdAt: string;
    }> = [];
    const trades = input.trades
      .filter((trade) => trade.ticker === holding.ticker)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const trade of trades) {
      if (!validPositive(trade.shares)) continue;
      if (trade.side === "buy") {
        lots.push({ shares: trade.shares, createdAt: trade.createdAt });
        continue;
      }
      let sharesToRemove = trade.shares;
      for (const lot of lots) {
        const removed = Math.min(lot.shares, sharesToRemove);
        lot.shares -= removed;
        sharesToRemove -= removed;
        if (sharesToRemove <= 1e-8) break;
      }
    }

    const remainingShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
    const tolerance = Math.max(1e-6, holding.shares * 1e-5);
    if (Math.abs(remainingShares - holding.shares) > tolerance) {
      allPositionsMatched = false;
      continue;
    }
    for (const lot of lots.filter((item) => item.shares > 1e-8)) {
      const benchmarkEntryPrice = findBenchmarkEntry(lot.createdAt);
      if (
        !validPositive(benchmarkEntryPrice) ||
        !validPositive(input.benchmarkCurrentPrice)
      ) {
        allPositionsMatched = false;
        continue;
      }
      const capital = lot.shares * holding.averageCost;
      matchedCostBasis += capital;
      matchedBenchmarkCurrentValue +=
        capital * (input.benchmarkCurrentPrice / benchmarkEntryPrice);
    }
  }

  const matchedBenchmarkReturn =
    allPositionsMatched &&
    Math.abs(matchedCostBasis - investedCostBasis) <=
      Math.max(0.01, investedCostBasis * 1e-5)
      ? calculateReturn(matchedBenchmarkCurrentValue, matchedCostBasis)
      : null;

  return {
    investedCostBasis,
    investedCurrentValue,
    holdingsReturn,
    matchedBenchmarkReturn,
    excessReturn:
      holdingsReturn === null || matchedBenchmarkReturn === null
        ? null
        : normaliseReturn(holdingsReturn - matchedBenchmarkReturn),
  };
}
