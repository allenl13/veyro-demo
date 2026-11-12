# Veyro — synthetic research and portfolio demo

Veyro is an explainable company-research interface with a simulated portfolio. This local release candidate retains the research presentation, scoring policy, risk explanations, portfolio engine and comparison charts from a personal research app. It runs entirely on authored fictional data, without API keys or a database.

**Release:** reviewed offline showcase, refreshed 13 November 2026. Original private history and runtime data are excluded. No project-wide open-source licence has been granted.


## Download the source

The complete reviewed source is packaged in [veyro-synthetic-demo-0.1.0.zip](./veyro-synthetic-demo-0.1.0.zip). It contains the application, synthetic fixtures, 141 tests, documentation and a file manifest. This repository currently distributes the source archive rather than an unpacked source tree.

Download and extract the ZIP, then open a terminal inside the extracted `veyro-synthetic-demo` folder. The commands below run from that folder. The archive SHA-256 is recorded in [SHA256SUMS](./SHA256SUMS).

## Run locally

Use Node.js **24 LTS**, or Node 22.19+ within the 22.x line, and npm. This refresh passed a fresh offline installation and release verification with Node 24.20.0. Dependency tarballs came from a local npm cache; a cold-cache online installation was not tested. From this directory:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173/research** or **http://127.0.0.1:4173/portfolio**. The server binds to loopback and refuses a busy port. No `.env` file, provider account, owner login or credentials are required. Installing dependencies normally needs registry access; running the installed demo does not need external services.

For a production build and preview:

```sh
npm run verify:release
npm run preview
```

In another terminal, `npm run verify:live` checks the local preview's pages, assets and security headers. Stop the preview with Ctrl+C. `npm run release:archive` creates an allowlisted source archive and checksums under `release/`; this optional packaging command also requires Python 3.

## What to explore

- Seven fictional companies demonstrate profitable, loss-making, missing-input, period-mismatched, stale and currency-mismatched research cases. Open a company to inspect score inputs, risks and synthetic source records.
- The original annual-core scoring weights and portfolio decision rules remain in `lib/`. Missing core inputs leave the research score unavailable. Purchases require verified ranking, profitability and risk checks. Research scores rank candidates; they do not on their own authorize purchases. Current rules use the Top 15 ranking for exits when evidence is verified.
- A deterministic fixture generator runs the retained simulation engine with invented prices and a fictional $10,000 starting balance. The ledger includes two purchases and a subsequent hold decision. Automatic scheduling is paused.
- Portfolio and comparison charts use common timestamps and price returns excluding dividends. The **SPY and QQQ comparison prices are artificial**, including every point of their histories; these are not ETF market returns.
- Research, holdings, trade history, light/dark appearance and responsive layouts are available. Appearance preferences use a demo-specific browser storage namespace. “Reset demo” reloads the fixed fixture; it does not operate another app or reset real records.

The clock is frozen at **30 June 2026, 20:05 UTC**. Price labels use New York time; activity records use UTC. The demo's June weekdays are an illustrative calendar, not a complete exchange holiday model. The seed is generated into ignored `.demo/state.json` and bundled into the local build. It is never loaded from the personal app.

## Validation and scope

`npm run verify:release` runs type checking, lint, the retained regression tests and new demo-boundary tests, production build, and the source allowlist/privacy checks. See validation evidence (`docs/VALIDATION.md` inside the source ZIP), architecture (`docs/ARCHITECTURE.md` inside the source ZIP), limitations (`docs/LIMITATIONS.md` inside the source ZIP) and source adaptation inventory (`docs/SOURCE_SCOPE.md` inside the source ZIP).

The public candidate intentionally omits the private app's provider ingestion, Cloudflare/D1 deployment, local tracker service, account gates, owner operations and scheduled collection jobs. The `/api/*` contracts used by the interface are handled **inside the browser** by a read-only demo adapter; they are not an HTTP backend. This is a demonstration of the retained application and pure engine, not an installation of the original operational system.

This project demonstrates software engineering and evidence presentation. Its data and displayed performance are fictional and cannot support investment decisions or claims about strategy returns. Source-check labels describe consistency of authored inputs, not independent verification of issuer filings.

## Contribution, security and licensing

Read `CONTRIBUTING.md` and `SECURITY.md` before extending the candidate. Dependency metadata and installed-package notices are recorded in the licence inventory (`docs/DEPENDENCIES.md` inside the source ZIP), the machine-readable inventory (`docs/dependency-inventory.json` inside the source ZIP) and `THIRD_PARTY_NOTICES.txt`.

No project-wide open-source licence is granted yet. The licence decision note (`docs/LICENCE_DECISION.md` inside the source ZIP) recommends MIT for the owner's consideration and explains the remaining rights review.


## Current-source refresh

The current Research interface, annual-core policy, simulation engine, ranking/risk modules, holding policy and matching regression suites were refreshed from the active app. Synthetic labels, fixtures, adapters and isolated browser-storage keys remain. Production SEC ingestion, reviewed financial records, scheduled jobs and private runtime are deliberately excluded, including the November private-data refresh tests. This is a scoped offline engineering demo, not a complete backup of the running app. No financial-policy settings in the original app were changed.

The current candidate has no screenshots; earlier screenshots were removed rather than presenting them as evidence of this refresh.
