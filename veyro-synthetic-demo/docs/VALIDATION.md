# Current candidate validation

Refreshed 13 November 2026 from current local source, retaining isolated synthetic fixtures.

- Node 24.20.0: typecheck, lint, 141 tests, production build and allowlist/common-secret checks passed.
- HTTP smoke checks passed for Research/Portfolio, built assets, icons and same-origin Content Security Policy.
- Source release contains no original Git history, runtime database, environment files, provider data captures or real portfolios. No source or service in the original app was changed.
- Chrome Research, company detail open/close, current policy labels, Portfolio and All-range benchmark comparison were inspected. A narrow Research viewport was inspected without horizontal document overflow. Mobile Portfolio and exhaustive keyboard/accessibility checks were not performed. No screenshot files are included.
- Fresh offline installation using cached npm packages passed with Node 24.20.0. The optional fsevents install script was not enabled. Current dependency vulnerability checks and cold-cache online installation were not performed.
- Build reports a large JavaScript chunk warning.
- Secret pattern scans are bounded checks, not an exhaustive guarantee.

The 141 tests cover simulation decisions, ranking and holding policy, financial calculations, data consistency, deterministic demo generation, write rejection, synthetic benchmarks and demo isolation. Private production integrations are not exercised.
