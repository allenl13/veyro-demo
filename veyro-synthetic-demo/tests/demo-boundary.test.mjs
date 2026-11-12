import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { generateDemo, DEMO_NOW } from '../demo/fixtures.ts';
import { demoResponse } from '../demo/api.ts';
import { sinceStartBenchmarkComparisons, verifiedChartPrice } from '../lib/portfolio-benchmark.ts';
import { latestPortfolioChartSnapshot } from '../lib/performance-chart.ts';
import { verifiedResearchQuotes } from '../lib/research-display-price.ts';
import { researchScoreVerificationReasons } from '../lib/research-score-verification.ts';

const request = (path, method = 'GET', body) => new Request(`http://127.0.0.1:4173${path}`, {
  method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });

test('seed is byte deterministic and ignores owner environment/path overrides', async () => {
  const first = generateDemo();
  assert.deepEqual(first, generateDemo());
  const seed = () => spawnSync(process.execPath, ['--experimental-strip-types','scripts/seed-demo.mjs'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, VEYRO_PRIVATE_OPERATIONS_TOKEN: 'deliberate-fake-test-token',
      CLEARSIGNAL_MINIFLARE_STATE_PATH: '/must-not-be-used', TRACKER_URL: 'http://127.0.0.1:4318' }, encoding: 'utf8' });
  assert.equal(seed().status, 0);
  const a = await readFile(new URL('../.demo/state.json', import.meta.url));
  assert.equal(seed().status, 0);
  assert.deepEqual(await readFile(new URL('../.demo/state.json', import.meta.url)), a);
  assert.deepEqual(JSON.parse(a), first);
  assert.equal(first.portfolio.autoTrading.enabled, false);
  assert.deepEqual(first.portfolio.holdings.map(h => h.ticker).sort(), ['DEMO1','DEMO2']);
  assert.equal(first.portfolio.trades.length, 2);
  assert.ok(first.portfolio.autoTrading.decisions.some(d => d.action === 'hold'));
});

test('fictional gaps and mismatches never qualify for a purchase', () => {
  const s = generateDemo();
  for (const ticker of ['DEMO4','DEMO5','DEMO6','DEMO7']) {
    const stock = s.scan.researchUniverse.find(v => v.ticker === ticker);
    assert.equal(stock.researchV2.score, null);
    assert.equal(stock.researchV2.simulatedBuyEligible, false);
    assert.ok(researchScoreVerificationReasons(stock, DEMO_NOW, DEMO_NOW).length > 0);
  }
  const loss = s.scan.researchUniverse.find(v => v.ticker === 'DEMO3');
  assert.ok(loss.researchV2.score < 65);
  assert.equal(loss.researchV2.simulatedBuyEligible, false);
});

test('all benchmark paths are authored, time aligned and price only', () => {
  const s = generateDemo();
  const comparisons = sinceStartBenchmarkComparisons(s.portfolio, s.snapshots, Date.parse(DEMO_NOW));
  for (const c of comparisons) {
    assert.equal(c.status, 'since-start');
    assert.equal(c.baselineAt, s.portfolio.trades[0].createdAt);
    assert.equal(c.endAt, s.quotes[0].asOf);
    assert.ok(Number.isFinite(c.benchmarkReturn));
    assert.equal(c.source, 'Veyro authored synthetic fixture v1');
  }
  assert.ok(latestPortfolioChartSnapshot(s.quotes, ['DEMO1','DEMO2','SPY'], Date.parse(DEMO_NOW)));
  assert.equal(verifiedResearchQuotes(s.quotes, s.quotes.map(q => q.symbol), Date.parse(DEMO_NOW)).DEMO1.price, s.quotes[0].price);
  const invalid = structuredClone(s.snapshots.at(-1));
  invalid.quoteEvidence.find(q => q.symbol === 'SPY').source = 'Yahoo Finance chart API';
  assert.equal(verifiedChartPrice(invalid, 'SPY', Date.parse(DEMO_NOW)), false);
});

test('demo API answers local synthetic reads and rejects operations and external URLs', async () => {
  const s = generateDemo(), before = JSON.stringify(s);
  const health = await (await demoResponse(request('/api/health'), s)).json();
  assert.equal(health.externalIntegrationsEnabled, false);
  assert.equal(health.schedulerEnabled, false);
  assert.equal((await (await demoResponse(request('/api/local-tracker/tests'), s)).json()).tests[0].provenance.kind, 'synthetic-demo');
  for (const path of ['/api/simulated-autopilot','/api/autopilot/run','/api/performance/collect-close','/api/owner-session','/api/local-tracker/tests'])
    assert.equal((await demoResponse(request(path, 'POST', { enabled: true }), s)).status, 403);
  assert.equal((await demoResponse(new Request('https://example.com/api/opportunities'), s)).status, 403);
  assert.equal((await demoResponse(request('/api/research-prices','POST',{ symbols: ['NVDA'] }), s)).status, 400);
  assert.equal((await demoResponse(new Request('http://127.0.0.1:4173/api/research-prices', { method: 'POST', body: 'invalid' }), s)).status, 400);
  assert.equal((await demoResponse(request('/api/local-tracker/history','POST',{ symbols: ['SPY'], from: 1, to: 2 }), s)).status, 200);
  assert.equal(JSON.stringify(s), before, 'Demo reads and rejected writes must leave the fixture unchanged');
  const wrong = structuredClone(s); wrong.provenance.kind = 'private-state';
  assert.equal((await demoResponse(request('/api/opportunities'), wrong)).status, 503);
});

test('history honours symbol and time selection without future or borrowed marks', async () => {
  const s = generateDemo();
  const from = Date.parse(s.snapshots[2].marketAsOf) / 1000, to = Date.parse(s.snapshots[5].marketAsOf) / 1000;
  const r = await (await demoResponse(request('/api/local-tracker/history','POST',{ symbols: ['DEMO1','SPY'], from, to }), s)).json();
  assert.equal(r.snapshots.length, 4);
  for (const snap of r.snapshots) {
    assert.deepEqual(Object.keys(snap.prices), ['DEMO1','SPY']);
    assert.equal(snap.quoteEvidence.length, 2);
    assert.ok(Date.parse(snap.marketAsOf) / 1000 >= from && Date.parse(snap.marketAsOf) / 1000 <= to);
  }
});


test('demo assessments carry the current scoring and portfolio policy together', () => {
  const s = generateDemo();
  for (const stock of s.scan.researchUniverse) {
    assert.equal(stock.researchV2.portfolioPolicy, 'annual-core-top15-exit-growth50-profit-or-fcf-no-score-floor-2026-10-13');
    assert.equal(stock.researchV2.scoringRevision, 'annual-core-growth50-net0-yield5-cap50-2026-10-13');
    assert.ok(!stock.researchV2.buyReasons.some(r => r.includes('Revenue growth below')));
  }
});
