import type { DemoState } from './fixtures.ts';
import { DEMO_NOW, DEMO_SOURCE } from './fixtures.ts';
export async function demoResponse(request: Request, state: DemoState): Promise<Response> {
  const url = new URL(request.url);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Veyro-Mode': 'synthetic-demo' } });
  if (state.provenance.kind !== 'synthetic-demo' || state.provenance.fixtureVersion !== 1) return json({ error: 'Synthetic fixture required' }, 503);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '4173') return json({ error: 'External integration disabled' }, 403);
  if (request.method === 'GET' && url.pathname === '/api/opportunities') return json(state.scan);
  if (request.method === 'GET' && url.pathname === '/api/local-tracker/tests') return json({ tests: [state.portfolio] });
  if (request.method === 'GET' && url.pathname === '/api/simulated-autopilot') return json({ mode: 'SIMULATED', strategy: 'AI Opportunities', enabled: false,
    execution: 'SIMULATED_ONLY', trackerStatus: 'ready', schedulerStatus: 'paused', lastCheckedAt: null, lastSuccessfulAt: null, lastError: null,
    portfolio: { initialCash: state.portfolio.initialCash, cash: state.portfolio.cash, holdingsCount: state.portfolio.holdings.length, tradeCount: state.portfolio.trades.length }, latestTrade: null, latestLoop: null });
  if (request.method === 'GET' && url.pathname === '/api/company-sources') {
    const ticker = url.searchParams.get('ticker');
    const stock = state.scan.researchUniverse.find(s => s.ticker === ticker);
    if (!stock) return json({ error: 'Unknown fictional company' }, 404);
    return json({ filingUrl: `https://demo.veyro.invalid/evidence/${ticker}`, companyUrl: `https://demo.veyro.invalid/evidence/${ticker}`,
      filingDate: '2026-02-15', form: 'SYNTHETIC', periodEnd: '2025-12-31', provenance: state.provenance,
      calculationReview: { observedAt: DEMO_NOW, periodEnd: '2025-12-31', traces: stock.riskCalculationTraces } });
  }
  if (request.method === 'POST' && ['/api/local-tracker/quotes','/api/research-prices','/api/local-tracker/history'].includes(url.pathname)) {
    let body: { symbols?: unknown; from?: number; to?: number };
    try { body = await request.json(); } catch { return json({ error: 'JSON body required' }, 400); }
    if (!Array.isArray(body.symbols) || !body.symbols.length || body.symbols.length > 30 || body.symbols.some(s => typeof s !== 'string')) return json({ error: 'Supply 1–30 demo symbols' }, 400);
    const symbols = [...new Set(body.symbols)] as string[];
    if (symbols.some(s => !state.quotes.some(q => q.symbol === s))) return json({ error: 'Unknown demo symbol' }, 400);
    if (url.pathname.endsWith('/history')) {
      if (body.from !== undefined && !Number.isFinite(body.from) || body.to !== undefined && !Number.isFinite(body.to)) return json({ error: 'Invalid time range' }, 400);
      const inRange = (asOf: string) => Date.parse(asOf) / 1000 >= (body.from ?? 0) && Date.parse(asOf) / 1000 <= (body.to ?? Date.parse(DEMO_NOW) / 1000);
      return json({ snapshots: state.snapshots.filter(s => inRange(s.marketAsOf)).map(s => ({ ...s,
        prices: Object.fromEntries(Object.entries(s.prices).filter(([symbol]) => symbols.includes(symbol))), quoteEvidence: s.quoteEvidence.filter(q => symbols.includes(q.symbol)) })),
        dailyCloses: state.dailyCloses.filter(q => symbols.includes(q.symbol) && inRange(q.asOf)), generatedAt: DEMO_NOW, source: DEMO_SOURCE });
    }
    return json({ quotes: state.quotes.filter(q => symbols.includes(q.symbol)), generatedAt: DEMO_NOW });
  }
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, mode: 'synthetic-demo', schedulerEnabled: false, externalIntegrationsEnabled: false });
  return json({ error: 'Operation disabled in the synthetic demonstration' }, 403);
}
