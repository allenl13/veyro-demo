import React from 'react';
import { createRoot } from 'react-dom/client';
import { DiscoverDashboard } from '../app/research-dashboard';
import { demoResponse } from './api';
import { DEMO_NOW, type DemoState } from './fixtures';
import state from '../.demo/state.json';
import '../app/globals.css';
import '../app/personal-appearance.css';
import './demo.css';
// Frozen clock is confined to this demo browser; no installed runtime is imported.
const OriginalDate = Date;
class FrozenDate extends OriginalDate {
  constructor(value?: string | number | Date) { super(value === undefined ? DEMO_NOW : value instanceof OriginalDate ? value.getTime() : value); }
  static now() { return OriginalDate.parse(DEMO_NOW); }
}
globalThis.Date = FrozenDate as DateConstructor;
// All application fetches terminate in this in-memory adapter; there is no upstream fallback.
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), location.origin), init);
  request.signal.throwIfAborted();
  return demoResponse(request, state as DemoState);
};
try { if (localStorage.getItem('veyro-demo-theme') === 'light') document.documentElement.dataset.theme = 'light'; } catch { /* Optional appearance only. */ }
const evidenceTicker = location.pathname.startsWith('/demo/evidence/') ? location.pathname.split('/').at(-1) : null;
document.addEventListener('click', event => {
  const link = (event.target as Element).closest('a');
  if (link?.href.startsWith('https://demo.veyro.invalid/')) { event.preventDefault(); location.href = `/demo/evidence/${link.href.split('/').at(-1)}`; }
});
const stock = (state as DemoState).scan.researchUniverse.find(s => s.ticker === evidenceTicker);
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <aside className="demo-banner" aria-label="Synthetic demo notice"><strong>Synthetic demo</strong><span>Fictional companies · artificial prices · clock frozen at 30 Jun 2026 · Autopilot paused</span><a href="/research">Research</a><a href="/portfolio">Portfolio</a><button onClick={() => location.reload()}>Reset demo</button></aside>
  {evidenceTicker ? <main className="demo-evidence"><a href="/research">← Research</a><h1>Synthetic evidence: {evidenceTicker}</h1><p>This is authored demo data, not an issuer filing. Verification flags describe internal consistency only.</p><pre>{JSON.stringify(stock ?? { error: 'Unknown fictional company' }, null, 2)}</pre></main>
    : <DiscoverDashboard initialSection={location.pathname === '/portfolio' ? 'portfolio' : 'research'} />}
</React.StrictMode>);

requestAnimationFrame(() => {
  for (const [selector, variable] of [['.demo-banner', '--demo-banner-height'], ['.topbar', '--demo-navigation-height']]) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const measure = () => document.documentElement.style.setProperty(variable, `${element.getBoundingClientRect().height}px`);
    measure();
    new ResizeObserver(measure).observe(element);
  }
  // The private UI's original anchor offset did not include the extra demo notice.
  if (location.pathname === '/portfolio') requestAnimationFrame(() => document.getElementById('portfolio')?.scrollIntoView({ block: 'start' }));
});
