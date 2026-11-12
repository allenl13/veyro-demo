import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateReturn,
  compareInvestedHoldingsWithBenchmark,
  compareWithBenchmark,
  normaliseReturn,
} from "../lib/financial-metrics.ts";

function closeTo(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not close to ${expected}`);
}

test("uses the same starting value for daily and total return on day one", () => {
  const currentValue = 10_025;
  const startingValue = 10_000;

  closeTo(calculateReturn(currentValue, startingValue), 0.0025);
  closeTo(calculateReturn(currentValue, startingValue), 0.0025);
});

test("compares portfolio and SPY over matching baselines", () => {
  const comparison = compareWithBenchmark({
    portfolioCurrentValue: 10_200,
    portfolioBaselineValue: 10_000,
    benchmarkCurrentPrice: 505,
    benchmarkBaselinePrice: 500,
  });

  closeTo(comparison.portfolioReturn, 0.02);
  closeTo(comparison.benchmarkReturn, 0.01);
  closeTo(comparison.excessReturn, 0.01);
});

test("does not turn missing or invalid baselines into performance", () => {
  assert.equal(calculateReturn(10_000, null), null);
  assert.equal(calculateReturn(10_000, 0), null);
  assert.deepEqual(
    compareWithBenchmark({
      portfolioCurrentValue: 10_000,
      portfolioBaselineValue: 10_000,
      benchmarkCurrentPrice: null,
      benchmarkBaselinePrice: 500,
    }),
    { portfolioReturn: 0, benchmarkReturn: null, excessReturn: null },
  );
});

test("normalises tiny movements so the interface never shows negative zero", () => {
  assert.equal(normaliseReturn(-0.000001), 0);
  assert.equal(Object.is(normaliseReturn(-0.000001), -0), false);
  assert.equal(normaliseReturn(-0.001), -0.001);
});

test("compares current holdings with SPY at their matched entry times", () => {
  const comparison = compareInvestedHoldingsWithBenchmark({
    holdings: [
      { ticker: "AAA", shares: 5, averageCost: 100 },
      { ticker: "BBB", shares: 10, averageCost: 50 },
    ],
    trades: [
      { side: "buy", ticker: "AAA", shares: 5, price: 100, createdAt: "2026-08-21T14:00:00.000Z" },
      { side: "buy", ticker: "BBB", shares: 10, price: 50, createdAt: "2026-08-26T14:00:00.000Z" },
    ],
    currentPrices: { AAA: 110, BBB: 60 },
    benchmarkCurrentPrice: 605,
    benchmarkSnapshots: [
      { capturedAt: "2026-08-21T14:00:00.000Z", marketAsOf: "2026-08-21T14:00:00.000Z", prices: { SPY: 500 } },
      { capturedAt: "2026-08-26T14:00:00.000Z", marketAsOf: "2026-08-26T14:00:00.000Z", prices: { SPY: 550 } },
    ],
  });

  closeTo(comparison.holdingsReturn, 0.15);
  closeTo(comparison.matchedBenchmarkReturn, 0.155);
  closeTo(comparison.excessReturn, -0.005);
});

test("compares only the shares still held after a partial sale", () => {
  const comparison = compareInvestedHoldingsWithBenchmark({
    holdings: [{ ticker: "AAA", shares: 6, averageCost: 100 }],
    trades: [
      { side: "buy", ticker: "AAA", shares: 10, price: 100, createdAt: "2026-08-21T14:00:00.000Z" },
      { side: "sell", ticker: "AAA", shares: 4, price: 110, createdAt: "2026-08-25T14:00:00.000Z" },
    ],
    currentPrices: { AAA: 120 },
    benchmarkCurrentPrice: 550,
    benchmarkSnapshots: [
      { capturedAt: "2026-08-21T14:00:00.000Z", marketAsOf: "2026-08-21T14:00:00.000Z", prices: { SPY: 500 } },
    ],
  });

  closeTo(comparison.holdingsReturn, 0.2);
  closeTo(comparison.matchedBenchmarkReturn, 0.1);
  closeTo(comparison.excessReturn, 0.1);
});

test("does not invent an invested benchmark when entry evidence is missing", () => {
  const comparison = compareInvestedHoldingsWithBenchmark({
    holdings: [{ ticker: "AAA", shares: 5, averageCost: 100 }],
    trades: [
      { side: "buy", ticker: "AAA", shares: 5, price: 100, createdAt: "2026-08-21T14:00:00.000Z" },
    ],
    currentPrices: { AAA: 110 },
    benchmarkCurrentPrice: 550,
    benchmarkSnapshots: [],
  });

  closeTo(comparison.holdingsReturn, 0.1);
  assert.equal(comparison.matchedBenchmarkReturn, null);
  assert.equal(comparison.excessReturn, null);
});
