/** Two bounded attempts; cancellation prevents retries and late publication. */
export async function recoverMarketData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  { timeoutMs = 15_000, retryDelayMs = 1_000 } = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    try {
      const value = await load(AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]));
      signal.throwIfAborted();
      return value;
    } catch (error) {
      signal.throwIfAborted();
      if (attempt === 1) throw error;
      await new Promise<void>((resolve, reject) => {
        const aborted = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, retryDelayMs);
        signal.addEventListener('abort', aborted, { once: true });
      });
    }
  }
  throw new Error('Market-data recovery exhausted');
}

export type ObservedQuote = { symbol: string; price: number; asOf: string };
/** Accept a complete bundle, never combine observations from separate responses. */
export function verifiedQuoteBundle(quotes: unknown, symbols: string[]) {
  if (!Array.isArray(quotes) || !symbols.length) throw new Error('Quote response is incomplete');
  const requested = new Set(symbols);
  const selected: ObservedQuote[] = [];
  for (const quote of quotes) {
    if (!requested.has(quote?.symbol)) continue;
    if (selected.some(q => q.symbol === quote.symbol) || !(quote.price > 0) || !Number.isFinite(quote.price)
      || typeof quote.asOf !== 'string' || !Number.isFinite(Date.parse(quote.asOf))) throw new Error('Quote observation is invalid');
    selected.push(quote);
  }
  if (selected.length !== requested.size) throw new Error('Quote response is incomplete');
  return { prices: Object.fromEntries(selected.map(q => [q.symbol, q.price])),
    asOf: Object.fromEntries(selected.map(q => [q.symbol, q.asOf])) };
}
