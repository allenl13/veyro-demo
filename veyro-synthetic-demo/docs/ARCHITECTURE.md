# Architecture

This candidate is a Vite/React single-page app. It preserves the private app's presentation and pure research/portfolio modules while replacing its operational boundary with an isolated, deterministic fixture.

```text
demo/fixtures.ts
    │ authored companies, metric gaps, prices, fixed clock and IDs
    ├── lib/research-v2-candidate.mjs  → research assessments
    └── lib/autopilot-engine.ts       → synthetic buy/hold ledger
                │
scripts/seed-demo.mjs → .demo/state.json (candidate-local, ignored)
                │
demo/main.tsx → browser clock + in-memory fetch adapter
                │
demo/api.ts → read-only interface contracts, no upstream fallback
                │
app/research-dashboard.tsx + app/portfolio-chart.tsx
                │
lib/* → explanations, eligibility, price validation, aligned charts
```

## Boundaries

- `scripts/seed-demo.mjs` writes only the fixed relative `.demo/state.json` path. It rejects a symlinked store or file. Environment variables do not select another data directory. Seed output is byte deterministic.
- `scripts/serve.mjs` passes a small OS/process environment allowlist to the seed and Vite subprocesses. It does not load owner/provider environment files. `vite.config.ts` also disables `.env` loading.
- `demo/main.tsx` replaces application fetch calls with `demoResponse`, freezes the browser clock and imports the generated fixture. It has no native-fetch fallback. Fixture source links on the reserved `.invalid` domain are routed to a local authored evidence page.
- `demo/api.ts` requires synthetic provenance, loopback host and port 4173. It allows the existing interface's research, portfolio, quote and history reads, validates symbol/time requests, and rejects operational writes. Some read contracts use POST to supply symbols; these do not modify state.
- Vite preview serves local files with a same-origin connection policy. The browser API adapter is not authentication or a production security boundary. There is no broker, scheduler, live data provider, database or server API in this candidate.
- Generated state and build output are local disposable demo artifacts. The release archive includes only the explicit files in `release-files.json`; it omits both, along with dependencies, history, environment files and workspace audit evidence.

## Retained policy and calculations

The annual-core policy, pure scoring implementation and pure Autopilot decision engine are copied without strategy changes. The fixture is assessed with the active policy/revision and original weights. Input traces include one inconsistent period and several explicit gaps. Stale synthetic inputs receive an explicit unavailable assessment. The original research eligibility and portfolio safeguards decide whether a qualifying simulated company can be purchased.

The generator runs the engine at a fixed entry timestamp in the original allowed entry window, then at a fixed after-close timestamp. Its ledger is subsequently marked paused. Stable run keys create repeatable record IDs. No historical ledger is imported.

The candidate's display/chart source validators accept only the authored synthetic quote-source label. They retain the underlying timestamp, currency, interval, adjustment-basis and alignment checks. This adaptation is confined to this copy; it does not relax the original app's market-data boundary.

## Storage and build

The only data file written by setup is the candidate's ignored synthetic seed. React reads that seed in memory. Browser storage contains demo appearance/request-gate preferences, not a mutable portfolio. `Reset demo` reloads the seed already in the bundle; after fixture edits, rebuild the production bundle.

`npm ci` uses a reduced lockfile with React, Vite, TypeScript, Tailwind and lint tooling. Private hosting/tracker/provider dependencies are absent. No source maps or external fonts are shipped. Vite's current production build emits a large main chunk; splitting it is deferred rather than changing the retained interface for this bounded candidate.
