import assert from "node:assert/strict";
import test from "node:test";
import {
  RESEARCH_READ_CACHE_MS,
  RESEARCH_SCAN_INTERVAL_MS,
  researchCacheExpiresAt,
} from "../lib/research-cache-policy.ts";

test("filing research follows a daily cadence independent of quote coverage", () => {
  const generatedAt = "2026-08-29T07:59:30.817Z";
  const complete = { generatedAt, pricedCount: 2, results: [{ currentPrice: 10 }, { currentPrice: 20 }] };
  const incomplete = { generatedAt, pricedCount: 1, results: [{ currentPrice: null }, { currentPrice: 20 }] };
  assert.equal(RESEARCH_SCAN_INTERVAL_MS, 24 * 60 * 60_000);
  assert.equal(RESEARCH_READ_CACHE_MS, 15 * 60_000);
  assert.equal(researchCacheExpiresAt(complete), Date.parse(generatedAt) + RESEARCH_SCAN_INTERVAL_MS);
  assert.equal(researchCacheExpiresAt(incomplete), researchCacheExpiresAt(complete));
  assert.equal(researchCacheExpiresAt({ generatedAt: "invalid" }), 0);
});
