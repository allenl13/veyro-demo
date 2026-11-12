import assert from "node:assert/strict";
import test from "node:test";
import { savePersistedTrackerPortfolio } from "../lib/tracker-portfolio-save.ts";

function portfolio(enabled) {
  return {
    id: "ai-paper-portfolio",
    kind: "ai-paper-portfolio",
    initialCash: 10_000,
    cash: 8_000,
    holdings: [],
    trades: [],
    snapshots: [],
    autoTrading: { enabled },
  };
}

test("generic saves adopt the tracker-confirmed record rather than claiming the requested state", async () => {
  const requested = portfolio(false);
  const persisted = portfolio(true);
  const result = await savePersistedTrackerPortfolio("http://127.0.0.1:4318", requested, async (_url, options) => {
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(String(options?.body)), { test: requested });
    return Response.json({ test: persisted });
  });
  assert.equal(result.autoTrading.enabled, true);
});

test("generic saves reject missing or mismatched persisted evidence", async () => {
  await assert.rejects(
    savePersistedTrackerPortfolio("http://127.0.0.1:4318", portfolio(false), async () => Response.json({ test: null })),
    /could not be saved and verified/,
  );
  await assert.rejects(
    savePersistedTrackerPortfolio("http://127.0.0.1:4318", portfolio(false), async () => Response.json({ test: { ...portfolio(false), id: "other" } })),
    /could not be saved and verified/,
  );
});
