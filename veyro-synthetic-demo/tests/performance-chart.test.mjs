import assert from "node:assert/strict";
import test from "node:test";
import {
  basisConsistentBenchmarkSeries,
  completedBenchmarkAdjustmentFactors,
  dailyClosingSnapshots,
  calendarMonthChartSnapshots,
  latestPortfolioChartSnapshot,
  mergePortfolioChartSnapshots,
  enrichDailySnapshotsWithIntraday,
  inceptionTradePrices,
  latestFiveTradingSessions,
  formatRebasedReturn,
  intradaySessionPosition,
  portfolioChartMovement,
  portfolioChartHistoryIdentity,
  portfolioChartSeries,
  portfolioChartValueChange,
  rebasedReturn,
  sampleTimeSeries,
  sessionStepPosition,
  sessionTickIndices,
  strategyValueAtSnapshot,
  timeSeriesPosition,
} from "../lib/performance-chart.ts";
import { marketDay, newYorkClock, regularSessionQuote } from "../lib/market-time.ts";

const trades = [
  { side: "buy", ticker: "AAA", shares: 1, price: 100, value: 100, createdAt: "2026-08-21T14:00:00.000Z" },
  { side: "buy", ticker: "BBB", shares: 2, price: 50, value: 100, createdAt: "2026-08-26T14:00:00.000Z" },
];

test("unchanged portfolio polling keeps the chart history request identity stable", () => {
  const portfolio = {
    id: "research-test",
    cash: 800,
    holdings: [{ ticker: "AAA", shares: 1, averageCost: 100 }],
    trades: [trades[0]],
    snapshots: [{ capturedAt: "2026-08-21T20:00:00.000Z", prices: { AAA: 101 } }],
  };
  const original = portfolioChartHistoryIdentity(portfolio, "SPY");
  const refreshed = {
    ...portfolio,
    cash: 805,
    holdings: portfolio.holdings.map((holding) => ({ ...holding })),
    trades: portfolio.trades.map((trade) => ({ ...trade })),
    snapshots: [...portfolio.snapshots, { capturedAt: "2026-08-22T20:00:00.000Z", prices: { AAA: 105 } }],
  };

  assert.deepEqual(portfolioChartHistoryIdentity(refreshed, "SPY"), original,
    "new portfolio objects and price snapshots must not retrigger the history effect");
  assert.notEqual(portfolioChartHistoryIdentity({
    ...refreshed,
    trades: [...refreshed.trades, { ...trades[1] }],
  }, "SPY").cacheKey, original.cacheKey, "a newly traded ticker needs its own history");
  assert.notEqual(portfolioChartHistoryIdentity({
    ...refreshed,
    trades: [{ ...trades[0], createdAt: "2026-08-20T14:00:00.000Z" }],
  }, "SPY").cacheKey, original.cacheKey, "an earlier first buy extends the required history");
});

test("New York trading dates stay correct across midnight and daylight saving", () => {
  assert.equal(marketDay("2026-09-29T02:00:00.000Z"), "2026-09-28");
  for (const open of ["2026-03-06T14:30:00.000Z", "2026-03-09T13:30:00.000Z"]) {
    assert.deepEqual(newYorkClock(new Date(open)), { weekday: open.includes("-06") ? "Fri" : "Mon", minutes: 570 });
    assert.equal(regularSessionQuote(new Date(open)), true);
  }
  assert.equal(regularSessionQuote(new Date("2026-03-09T20:00:00.000Z")), true);
  assert.equal(regularSessionQuote(new Date("2026-03-09T20:01:00.000Z")), false);
  assert.equal(regularSessionQuote(new Date("2026-03-08T13:30:00.000Z")), false);
});

test("daily closes retain inception and exclude weekend and after-hours observations", () => {
  const point = (at, price) => ({ capturedAt: at, marketAsOf: at, prices: { AAA: price } });
  const inception = point("2026-09-25T13:30:00.000Z", 100);
  const fridayClose = point("2026-09-25T20:00:00.000Z", 101);
  const saturday = point("2026-09-26T20:00:00.000Z", 999);
  const mondayOpen = point("2026-09-28T13:30:00.000Z", 102);
  const mondayClose = point("2026-09-28T20:00:00.000Z", 103);
  const afterHours = point("2026-09-28T21:00:00.000Z", 999);
  assert.deepEqual(
    dailyClosingSnapshots([inception, fridayClose, saturday, mondayOpen, mondayClose, afterHours]),
    [inception, fridayClose, mondayClose],
  );
});

test("1D uses the previous close while longer ranges rebase both lines at their first visible point", () => {
  const point = (at, stock, spy) => ({
    capturedAt: at,
    marketAsOf: at,
    prices: { AAA: stock, SPY: spy },
  });
  const fridayClose = point("2026-09-25T20:00:00.000Z", 100, 500);
  const mondayOpen = point("2026-09-28T13:35:00.000Z", 105, 510);
  const mondayLater = point("2026-09-28T14:00:00.000Z", 110, 520);
  const portfolio = {
    initialCash: 1_000,
    cash: 900,
    holdings: [{ ticker: "AAA", shares: 1, averageCost: 100 }],
    trades: [{ side: "buy", ticker: "AAA", shares: 1, price: 100, value: 100, createdAt: "2026-09-25T13:30:00.000Z" }],
  };
  const shared = {
    portfolio,
    snapshots: [fridayClose, mondayOpen, mondayLater],
    selectedTicker: null,
    benchmarkAdjustmentFactors: new Map(),
  };
  const today = portfolioChartSeries({ ...shared, displaySnapshots: [mondayOpen, mondayLater], range: "1D" });
  assert.equal(today.pointStart, 1_000);
  assert.deepEqual(today.pointValues, [1_005, 1_010]);
  assert.deepEqual(today.series.map((value) => Number(value.toFixed(6))), [0.005, 0.01]);
  assert.deepEqual(today.benchmark.map((value) => Number(value.toFixed(6))), [0.02, 0.04]);
  assert.equal(today.benchmarkLabel, "SPY price return");

  const fiveDays = portfolioChartSeries({ ...shared, displaySnapshots: [fridayClose, mondayOpen, mondayLater], range: "5D" });
  assert.equal(fiveDays.pointStart, 1_000);
  assert.deepEqual(fiveDays.series.map((value) => Number(value.toFixed(6))), [0, 0.005, 0.01]);
  assert.deepEqual(fiveDays.benchmark.map((value) => Number(value.toFixed(6))), [0, 0.02, 0.04]);
  assert.equal(fiveDays.series.length, fiveDays.benchmark.length);
});

test("all chart ranges compare price returns even when dividend adjustments are available", () => {
  const point = (at, stock, spy) => ({ capturedAt: at, marketAsOf: at, prices: { AAA: stock, SPY: spy } });
  const previous = point("2026-09-17T20:00:00.000Z", 100, 100);
  const exDividendClose = point("2026-09-18T20:00:00.000Z", 100, 98);
  const portfolio = {
    initialCash: 1_000, cash: 900,
    holdings: [{ ticker: "AAA", shares: 1, averageCost: 100 }],
    trades: [{ side: "buy", ticker: "AAA", shares: 1, price: 100, value: 100, createdAt: "2026-09-17T13:30:00.000Z" }],
  };
  // The history payload can retain dividend-adjustment evidence for audit.
  // It must not turn the price-only chart into a total-return comparison.
  const benchmarkAdjustmentFactors = new Map([["2026-09-17", 0.98], ["2026-09-18", 1]]);
  for (const range of ["1D", "5D", "1M", "Max"]) {
    for (const selectedTicker of [null, "AAA"]) {
      const chart = portfolioChartSeries({ portfolio, snapshots: [previous, exDividendClose],
        displaySnapshots: range === "1D" ? [exDividendClose] : [previous, exDividendClose],
        range, selectedTicker, benchmarkAdjustmentFactors });
      assert.equal(chart.benchmarkLabel, "SPY price return");
      assert.equal(chart.benchmarkValues.at(-1), 98);
      assert.ok(Math.abs(chart.benchmark.at(-1) - (-0.02)) < 1e-12,
        `${range} must retain the ex-dividend price fall rather than show a zero total return`);
      assert.equal(chart.series.at(-1), 0);
    }
  }
});

test("one-month comparison anchors to the latest New York session, including weekend and month-end boundaries", () => {
  const point = (day, price) => ({capturedAt: `${day}T20:00:00Z`, marketAsOf: `${day}T20:00:00Z`, prices: {SPY:price}});
  const values = [point("2026-08-31",767.05),point("2026-09-01",761.780029296875),point("2026-09-02",765.16),point("2026-10-01",763.99)];
  const selected = calendarMonthChartSnapshots(values);
  assert.deepEqual(selected,values.slice(1),"an Oct 2 NZ viewer must retain the Sep 1 start for the completed Oct 1 US session");
  const chart=portfolioChartSeries({portfolio:{initialCash:1000,cash:1000,holdings:[],trades:[]},displaySnapshots:selected,snapshots:values,selectedTicker:null,range:"1M"});
  assert.equal((chart.benchmark.at(-1)*100).toFixed(2),"0.29");
  const monthEnd=[point("2026-02-27",100),point("2026-03-02",110),point("2026-03-31",120)];
  assert.deepEqual(calendarMonthChartSnapshots(monthEnd),monthEnd,"February clamps to the 28th and uses its preceding trading close");
  assert.deepEqual(calendarMonthChartSnapshots(values.slice(-1)),values.slice(-1),"short history retains its actual start");
  assert.deepEqual(calendarMonthChartSnapshots([]),[]);
});

test("aligned display closes update only the rendered chart and retain provenance and stored history", () => {
  const now=Date.parse("2026-10-02T00:00:00Z");
  const quote=(symbol,price)=>({symbol,price,asOf:"2026-10-01T20:00:00Z",observedAt:"2026-10-01T20:02:00Z",source:"Veyro authored synthetic fixture v1",currency:"USD",interval:"1d",closeStatus:"verified",adjustmentBasis:"unadjusted regular-market close"});
  const quotes=[quote("SPY",763.99),quote("AMD",100)];
  const display=latestPortfolioChartSnapshot(quotes,["SPY","AMD"],now);
  assert.equal(display.prices.SPY,763.99);
  const stored=[{capturedAt:"2026-10-01T20:01:00Z",marketAsOf:"2026-10-01T20:00:00Z",prices:{SPY:764.02,AMD:99}}];
  const before=structuredClone(stored);
  const merged=mergePortfolioChartSnapshots([],stored,null,display);
  assert.equal(merged.length,1);assert.equal(merged[0].prices.SPY,763.99);assert.equal(merged[0].prices.AMD,100);
  assert.deepEqual(stored,before,"display fixes never rewrite saved simulated observations");
  for(const invalid of [quotes.slice(0,1),[...quotes,quotes[0]],
    [quote("SPY",NaN),quotes[1]], [{...quotes[0],asOf:"2026-10-01T19:55:00Z"},quotes[1]],
    [{...quotes[0],currency:"EUR"},quotes[1]], [{...quotes[0],adjustmentBasis:"adjusted"},quotes[1]],
    [{...quotes[0],closeStatus:"pending"},quotes[1]], [{...quotes[0],observedAt:"2026-10-03T00:00:00Z"},quotes[1]],
    [{...quotes[0],asOf:"2026-10-01T21:00:00Z"},{...quotes[1],asOf:"2026-10-01T21:00:00Z"}],
    [{...quotes[0],interval:"5m",adjustmentBasis:"unadjusted regular-market five-minute bar close"},quotes[1]]]) {
    assert.equal(latestPortfolioChartSnapshot(invalid,["SPY","AMD"],now),null);
  }
});

test("historical strategy value respects transaction timing and cash", () => {
  const value = strategyValueAtSnapshot({
    initialCash: 1_000,
    currentCash: 800,
    currentHoldings: [
      { ticker: "AAA", shares: 1, averageCost: 100 },
      { ticker: "BBB", shares: 2, averageCost: 50 },
    ],
    trades,
    asOf: Date.parse("2026-08-24T20:00:00.000Z"),
    prices: { AAA: 110, BBB: 500 },
  });
  assert.equal(value, 1_010, "future BBB position must not appear before its buy");
});

test("full-history endpoint reconciles with authoritative current cash and holdings", () => {
  const value = strategyValueAtSnapshot({
    initialCash: 1_000,
    currentCash: 799.99,
    currentHoldings: [
      { ticker: "AAA", shares: 1, averageCost: 100 },
      { ticker: "BBB", shares: 2, averageCost: 50 },
    ],
    trades,
    asOf: Date.parse("2026-08-28T20:00:00.000Z"),
    prices: { AAA: 120, BBB: 60 },
  });
  assert.equal(value, 1_039.99);
  assert.equal((value / 1_000 - 1).toFixed(4), "0.0400");
});

test("chart inception uses only prices paid in the first trade cycle", () => {
  const lifecycle = [
    { side: "buy", ticker: "AAA", shares: 1, price: 100, value: 100, createdAt: "2026-08-21T14:00:00.000Z" },
    { side: "buy", ticker: "BBB", shares: 2, price: 50, value: 100, createdAt: "2026-08-21T14:00:00.000Z" },
    { side: "buy", ticker: "AAA", shares: 1, price: 130, value: 130, createdAt: "2026-08-28T14:00:00.000Z" },
  ];
  const entryPrices = inceptionTradePrices(lifecycle);
  assert.deepEqual(entryPrices, { AAA: 100, BBB: 50 });
  assert.equal(strategyValueAtSnapshot({
    initialCash: 1_000,
    currentCash: 670,
    currentHoldings: [
      { ticker: "AAA", shares: 2, averageCost: 115 },
      { ticker: "BBB", shares: 2, averageCost: 50 },
    ],
    trades: lifecycle,
    asOf: Date.parse("2026-08-21T14:00:00.000Z"),
    prices: entryPrices,
  }), 1_000, "later purchases and average costs must not distort the inception baseline");
});

test("SPY adjustment factors require completed, consistent evidence", () => {
  const raw17 = Number("762.5999755859375");
  const adjusted17 = Number("760.7109985351562");
  const close18 = Number("761.6900024414062");
  const evidence = (marketDay, rawClose, adjustedClose, overrides = {}) => ({
    symbol: "SPY",
    marketAsOf: `${marketDay}T20:00:00.000Z`,
    marketDay,
    rawClose,
    adjustedClose,
    source: "Veyro authored synthetic fixture v1",
    adjustmentBasis: "dividend-and-split-adjusted close",
    completed: true,
    ...overrides,
  });
  const factors = completedBenchmarkAdjustmentFactors([
    evidence("2026-09-17", raw17, adjusted17),
    evidence("2026-09-18", close18, close18),
    evidence("2026-09-19", 760, 760, { completed: false }),
    evidence("2026-09-20", 760, 759),
    evidence("2026-09-20", 760, 758),
  ]);

  assert.equal(factors.has("2026-09-19"), false);
  assert.equal(factors.has("2026-09-20"), false);
  const start = raw17 * factors.get("2026-09-17");
  const end = close18 * factors.get("2026-09-18");
  assert.ok(Math.abs(rebasedReturn(end, start) - Number("0.0012869590529585029")) < 1e-12);
});

test("benchmark evidence rejects loose types, wrong provenance, day mismatches, and equal-ratio conflicts", () => {
  const valid = {
    symbol: "SPY",
    marketAsOf: "2026-09-18T20:00:00.000Z",
    marketDay: "2026-09-18",
    rawClose: 100,
    adjustedClose: 99,
    source: "Veyro authored synthetic fixture v1",
    adjustmentBasis: "dividend-and-split-adjusted close",
    completed: true,
  };
  const rejected = completedBenchmarkAdjustmentFactors([
    { ...valid, marketDay: "2026-09-17" },
    { ...valid, completed: "false" },
    { ...valid, rawClose: "100" },
    { ...valid, symbol: "QQQ" },
    { ...valid, source: "unknown" },
    { ...valid, adjustmentBasis: "unadjusted close" },
  ]);
  assert.equal(rejected.size, 0);

  const conflict = completedBenchmarkAdjustmentFactors([
    valid,
    { ...valid, rawClose: 200, adjustedClose: 198 },
  ]);
  assert.equal(conflict.has("2026-09-18"), false);
});

test("benchmark chart selects one basis for the entire displayed period", () => {
  const points = [
    { marketDay: "2026-09-17", rawClose: 762.6 },
    { marketDay: "2026-09-18", rawClose: 761.69 },
  ];
  const complete = new Map([
    ["2026-09-17", 760.711 / 762.6],
    ["2026-09-18", 1],
  ]);
  const adjusted = basisConsistentBenchmarkSeries(points, complete);
  assert.equal(adjusted.basis, "total-return");
  assert.ok(adjusted.returns[1] > 0.0012 && adjusted.returns[1] < 0.0014);

  const incomplete = basisConsistentBenchmarkSeries(
    points,
    new Map([["2026-09-17", 760.711 / 762.6]]),
  );
  assert.equal(incomplete.basis, "price");
  assert.ok(incomplete.returns[1] < -0.0011 && incomplete.returns[1] > -0.0013);
  assert.deepEqual(incomplete.values, [762.6, 761.69]);
});

test("mixed valid and invalid same-day evidence forces raw basis in either order", () => {
  const day17 = {
    symbol: "SPY",
    marketAsOf: "2026-09-17T20:00:00.000Z",
    marketDay: "2026-09-17",
    rawClose: 101,
    adjustedClose: 100,
    source: "Veyro authored synthetic fixture v1",
    adjustmentBasis: "dividend-and-split-adjusted close",
    completed: true,
  };
  const validDay18 = {
    ...day17,
    marketAsOf: "2026-09-18T20:00:00.000Z",
    marketDay: "2026-09-18",
    rawClose: 100,
    adjustedClose: 99,
  };
  const invalidDay18 = { ...validDay18, adjustedClose: 90, completed: false };
  const malformedDay18 = { ...validDay18, adjustedClose: "90" };
  const points = [
    { marketDay: "2026-09-17", rawClose: 101 },
    { marketDay: "2026-09-18", rawClose: 100 },
  ];

  for (const records of [
    [day17, validDay18, invalidDay18],
    [invalidDay18, validDay18, day17],
    [day17, validDay18, malformedDay18],
    [malformedDay18, validDay18, day17],
  ]) {
    const factors = completedBenchmarkAdjustmentFactors(records);
    assert.equal(factors.has("2026-09-18"), false);
    const series = basisConsistentBenchmarkSeries(points, factors);
    assert.equal(series.basis, "price");
    assert.deepEqual(series.values, [101, 100]);
  }
});

test("5D selects the latest five available trading sessions, not seven calendar days", () => {
  const sessions = ["21 Aug", "24 Aug", "25 Aug", "26 Aug", "27 Aug", "28 Aug"];
  assert.deepEqual(latestFiveTradingSessions(sessions), ["24 Aug", "25 Aug", "26 Aug", "27 Aug", "28 Aug"]);
  assert.deepEqual(latestFiveTradingSessions(sessions.slice(0, 3)), sessions.slice(0, 3));
});

test("multi-session charts add only genuine regular-session observations and retain daily endpoints", () => {
  const daily = [
    { id: "mon-close", at: 100, day: "2026-09-14", regular: true },
    { id: "tue-close", at: 200, day: "2026-09-15", regular: true },
    { id: "wed-close", at: 300, day: "2026-09-16", regular: true },
  ];
  const available = [
    { id: "mon-before-close", at: 90, day: "2026-09-14", regular: true },
    { id: "tue-open", at: 120, day: "2026-09-15", regular: true },
    { id: "tue-after-hours", at: 210, day: "2026-09-15", regular: false },
    { id: "wed-mid", at: 240, day: "2026-09-16", regular: true },
    { id: "outside-range", at: 260, day: "2026-09-17", regular: true },
    { id: "wrong-close", at: 300, day: "2026-09-16", regular: true },
  ];
  const points = enrichDailySnapshotsWithIntraday(daily, available, {
    timestamp: (point) => point.at,
    sessionKey: (point) => point.day,
    isRegularMarketPoint: (point) => point.regular,
  });

  assert.deepEqual(points.map((point) => point.id), [
    "mon-close",
    "tue-open",
    "tue-close",
    "wed-mid",
    "wed-close",
  ]);
  assert.equal(points[0], daily[0]);
  assert.equal(points.at(-1), daily.at(-1));
});

test("multi-session chart positions remove closed-market spacing without changing real points", () => {
  const point = (id, at, day, value) => ({
    id,
    at: Date.parse(at),
    day,
    value,
    regular: true,
  });
  const daily = [
    point("mon-close", "2026-09-14T20:00:00Z", "2026-09-14", 100),
    point("tue-close", "2026-09-15T20:00:00Z", "2026-09-15", 102),
    point("wed-close", "2026-09-16T20:00:00Z", "2026-09-16", 103),
  ];
  const available = [
    point("tue-open", "2026-09-15T13:30:00Z", "2026-09-15", 101),
    point("wed-mid", "2026-09-16T17:00:00Z", "2026-09-16", 102.5),
  ];
  const points = enrichDailySnapshotsWithIntraday(daily, available, {
    timestamp: (item) => item.at,
    sessionKey: (item) => item.day,
    isRegularMarketPoint: (item) => item.regular,
  });

  assert.deepEqual(points.map((item) => item.id), [
    "mon-close",
    "tue-open",
    "tue-close",
    "wed-mid",
    "wed-close",
  ]);
  assert.deepEqual(points.map((item) => item.value), [100, 101, 102, 102.5, 103]);
  assert.equal(points[0], daily[0]);
  assert.equal(points.at(-1), daily.at(-1));

  const positions = points.map((_, index) => sessionStepPosition(index, points.length));
  assert.deepEqual(positions, [0, 0.25, 0.5, 0.75, 1]);
  const elapsedPositions = points.map((item) =>
    timeSeriesPosition(item.at, points[0].at, points.at(-1).at),
  );
  assert.ok(elapsedPositions[3] - elapsedPositions[2] > 0.4);
  assert.equal(positions[0], 0);
  assert.equal(positions.at(-1), 1);
});

test("time-based chart sampling preserves true endpoints and spreads recent intraday data by elapsed time", () => {
  const points = [
    { at: 0, id: "start" },
    { at: 20, id: "day-one-close" },
    { at: 80, id: "day-two-close" },
    { at: 96, id: "late-open" },
    { at: 98, id: "late-mid" },
    { at: 100, id: "end" },
  ];
  const sampled = sampleTimeSeries(points, 4, (point) => point.at);
  assert.equal(sampled[0], points[0]);
  assert.equal(sampled.at(-1), points.at(-1));
  assert.ok(sampled.length <= 4);
  assert.ok(sampled.some((point) => point.id === "day-one-close"));
  assert.equal(timeSeriesPosition(0, 0, 100), 0);
  assert.equal(timeSeriesPosition(100, 0, 100), 1);
  assert.equal(timeSeriesPosition(50, 0, 100), 0.5);
  assert.equal(timeSeriesPosition(10, 10, 10), 0.5);
});

test("5D returns are exact rebases of the same raw full-history values", () => {
  const strategyValues = [10_025.986877286983, 10_046.533637329263, 10_070.676077259297, 10_108.664382999854, 10_134.793030933302];
  const spyValues = [763.51, 765.95, 766.08, 771.1, 769.35];
  const strategy5d = strategyValues.map((value) => rebasedReturn(value, strategyValues[0]));
  const spy5d = spyValues.map((value) => rebasedReturn(value, spyValues[0]));

  assert.deepEqual(strategy5d, strategyValues.map((value) => value / strategyValues[0] - 1));
  assert.deepEqual(spy5d, spyValues.map((value) => value / spyValues[0] - 1));
  assert.equal(strategy5d.at(-1), 0.010852413331281063);
  assert.equal(spy5d.at(-1), 0.007648884755929952);
});

test("portfolio chart dollar change uses the displayed range endpoints and never appears for tickers", () => {
  assert.equal(portfolioChartValueChange(null, 10_000, 10_125.5), 125.5);
  assert.ok(Math.abs(portfolioChartValueChange(null, 10_000, 9_998.97) - (-1.03)) < 1e-9);
  assert.equal(portfolioChartValueChange(null, 10_000, 10_000), 0);
  assert.equal(portfolioChartValueChange(null, null, 10_000), null);
  assert.equal(portfolioChartValueChange(null, 10_000, undefined), null);
  assert.equal(portfolioChartValueChange(null, 0, 10_000), null);
  assert.equal(portfolioChartValueChange("NVDA", 100, 110), null);
});

test("portfolio movement binds amount, percentage, and range label to one endpoint pair", () => {
  const cases = [
    { start: 10_000, end: 10_042.8, label: "today", amount: 42.8 },
    { start: 10_000, end: 9_999, label: "1W", amount: -1 },
    { start: 10_000, end: 10_000, label: "1M", amount: 0 },
  ];
  for (const scenario of cases) {
    const movement = portfolioChartMovement(null, scenario.start, scenario.end, scenario.label);
    assert.ok(movement);
    assert.ok(Math.abs(movement.valueChange - scenario.amount) < 1e-9);
    assert.equal(movement.returnValue, rebasedReturn(scenario.end, scenario.start));
    assert.equal(movement.periodLabel, scenario.label);
  }
  const allMovement = portfolioChartMovement(null, 10_000, 11_000, "All");
  assert.ok(allMovement);
  assert.equal(allMovement.valueChange, 1_000);
  assert.ok(Math.abs(allMovement.returnValue - 0.1) < 1e-12);
  assert.equal(allMovement.periodLabel, "All");
  assert.equal(portfolioChartMovement("NVDA", 100, 110, "today"), null);
  assert.equal(portfolioChartMovement(null, 0, 110, "today"), null);
  assert.equal(portfolioChartMovement(null, 100, undefined, "today"), null);
});

test("formatRebasedReturn uses +/- and minus symbol expected by chart tooltips", () => {
  assert.equal(formatRebasedReturn(0.003), "+0.30%");
  assert.equal(formatRebasedReturn(-0.0018), "−0.18%");
  assert.equal(formatRebasedReturn(0), "0.00%");
});

test("date-axis ticks refer only to actual available sessions", () => {
  assert.deepEqual(sessionTickIndices(5, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(sessionTickIndices(6, 5), [0, 1, 3, 4, 5]);
  assert.deepEqual(sessionTickIndices(0, 5), []);
});

test("session-based chart points use equal horizontal steps", () => {
  const positions = Array.from({ length: 6 }, (_, index) => sessionStepPosition(index, 6));
  assert.deepEqual(positions, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.ok(
    positions.slice(1).every(
      (position, index) => Math.abs(position - positions[index] - 0.2) < 1e-12,
    ),
  );
  assert.equal(sessionStepPosition(0, 1), 0.5);
});

test("intraday points occupy only elapsed regular-session time", () => {
  assert.equal(intradaySessionPosition(570), 0);
  assert.equal(intradaySessionPosition(660), 90 / 390);
  assert.equal(intradaySessionPosition(960), 1);
  assert.equal(intradaySessionPosition(500), 0);
  assert.equal(intradaySessionPosition(1_000), 1);
});


test("shared return scale fits both lines without forcing equal positive and negative space", async () => {
  const {sharedReturnScale,returnChartY,formatReturnAxisTick}=await import('../lib/performance-chart.ts');
  const scale=sharedReturnScale([-0.0005,0.006,0.008,0.001]);
  assert.ok(scale.low<=-0.0005 && scale.high>=0.008);
  assert.ok(scale.high-scale.low<0.016, 'less empty space than a symmetric range');
  assert.ok(scale.ticks.includes(0));
  assert.ok(scale.ticks.length>=3 && scale.ticks.length<=8);
  for(const height of [180,240,320]) {
    assert.equal(returnChartY(scale.high,scale,height),18);
    assert.equal(returnChartY(scale.low,scale,height),height-12);
    assert.ok(returnChartY(0.006,scale,height)<returnChartY(0.001,scale,height));
  }
  assert.match(formatReturnAxisTick(0.002,0.002),/^\+0\.2/);
  assert.match(formatReturnAxisTick(-0.002,0.002),/^−0\.2/);
  assert.doesNotMatch(formatReturnAxisTick(0,0.002),/[+−-]/);
  const smaller=sharedReturnScale([0.001,0.002]);
  assert.ok(smaller.high<scale.high,'old extremes do not persist into new data');
  for(const values of [[],[0,0],[NaN,Infinity],[0.002,0.002],[-0.03,-0.01]]) {
    const result=sharedReturnScale(values);
    assert.ok(Number.isFinite(result.low)&&Number.isFinite(result.high)&&result.high>result.low);
    assert.ok(values.filter(Number.isFinite).every(v=>v>=result.low&&v<=result.high));
    const labels=result.ticks.map(t=>formatReturnAxisTick(t,result.step));
    assert.equal(new Set(labels).size,labels.length,'axis labels remain distinct');
  }
});
