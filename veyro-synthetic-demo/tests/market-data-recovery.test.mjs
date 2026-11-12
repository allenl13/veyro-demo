import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverMarketData, verifiedQuoteBundle } from '../lib/market-data-recovery.ts';

test('transient failure recovers once; permanent failure stops after two attempts', async () => {
  let attempts = 0;
  const value = await recoverMarketData(async () => { if (++attempts === 1) throw new Error('offline'); return 7; }, new AbortController().signal, { retryDelayMs: 0 });
  assert.equal(value, 7); assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(recoverMarketData(async () => { attempts++; throw new Error('offline'); }, new AbortController().signal, { retryDelayMs: 0 }), /offline/);
  assert.equal(attempts, 2);
});

test('cancellation during retry delay prevents another request', async () => {
  const controller = new AbortController(); let attempts = 0;
  const pending = recoverMarketData(async () => { attempts++; throw new Error('offline'); }, controller.signal, { retryDelayMs: 100 });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(attempts, 1);
});

test('timeout aborts each attempt and late completion after cancellation is rejected', async () => {
  let attempts = 0;
  const keepAlive = setInterval(() => {}, 100);
  try {
  await assert.rejects(recoverMarketData(signal => new Promise((resolve, reject) => {
    attempts++; signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), new AbortController().signal, { timeoutMs: 5, retryDelayMs: 0 }), { name: 'TimeoutError' });
  assert.equal(attempts, 2);
  } finally { clearInterval(keepAlive); }
  const controller = new AbortController();
  await assert.rejects(recoverMarketData(async () => { controller.abort(); return 9; }, controller.signal), { name: 'AbortError' });
});

test('quote bundles require every requested observed price and preserve its timestamp', () => {
  const quotes = [{ symbol: 'SPY', price: 10, asOf: '2026-09-25T20:00:00Z' }, { symbol: 'ADBE', price: 20, asOf: '2026-09-25T20:00:00Z' }];
  assert.deepEqual(verifiedQuoteBundle(quotes, ['SPY', 'ADBE']), { prices: { SPY: 10, ADBE: 20 }, asOf: { SPY: quotes[0].asOf, ADBE: quotes[1].asOf } });
  for (const invalid of [[], quotes.slice(0,1), [...quotes, quotes[0]], [{...quotes[0],price:NaN},quotes[1]], [{...quotes[0],asOf:'Unknown'},quotes[1]]]) {
    assert.throws(() => verifiedQuoteBundle(invalid, ['SPY','ADBE']));
  }
});
