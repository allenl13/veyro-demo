import assert from "node:assert/strict";
import test from "node:test";
import { freshnessDelay, OverviewRequestGate } from "../lib/overview-request-gate.ts";

test("a delayed refresh cannot replace a confirmed simulation control response", () => {
  const gate = new OverviewRequestGate();
  const delayedRefresh = gate.beginRefresh();
  const control = gate.beginControl();
  assert.equal(gate.accepts(delayedRefresh), false);
  assert.equal(gate.accepts(control), true);
  assert.equal(gate.beginRefresh(), null, "polling stays blocked during the control request");
  gate.finishControl(control);
  const nextRefresh = gate.beginRefresh();
  assert.equal(gate.accepts(nextRefresh), true);
  assert.equal(gate.accepts(control), false);
});

test("simulation freshness schedules the exact expiry transition and rejects invalid evidence", () => {
  const completedAt = "2026-09-14T00:00:00.000Z";
  const completedMs = Date.parse(completedAt);
  assert.equal(freshnessDelay(completedAt, 60, completedMs), 60_001);
  assert.equal(freshnessDelay(completedAt, 60, completedMs + 60_000), 1);
  assert.equal(freshnessDelay(completedAt, 60, completedMs + 60_001), 0);
  assert.equal(freshnessDelay(null, 60, completedMs), null);
  assert.equal(freshnessDelay("invalid", 60, completedMs), null);
  assert.equal(freshnessDelay(completedAt, -1, completedMs), null);
});
