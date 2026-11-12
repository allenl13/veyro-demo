# Contributing

This is a local release candidate pending the owner's licence decision. No public contribution channel or repository is configured yet.

Use the supported Node version, run `npm ci`, then `npm run verify:release`. For UI changes, run the production preview and inspect `/research` and `/portfolio` at desktop and mobile widths. Open qualifying and excluded company details, switch QQQ/SPY and chart ranges, and verify labels for missing inputs and synthetic data. Update screenshots and `docs/VALIDATION.md` with the actual coverage.

Keep fixtures authored and clearly synthetic. Add new fictional cases to `demo/fixtures.ts`; do not import personal state, provider captures, saved trades, credentials or raw issuer data into this candidate. Do not connect scheduled jobs, brokers, external data sources or the original runtime as part of a demo change.

Preserve the model unless an explicitly scoped change calls for it. A missing score remains unavailable; separate eligibility from ranking; preserve source/time/currency/basis alignment; and keep portfolio/benchmark horizons consistent. Add a focused regression test for changed decision or data-boundary behavior. Existing tests do not need to be duplicated for styling-only changes.

If you add a file intended for release, add its exact relative path to `release-files.json`. An extracted archive includes a generated `MANIFEST.sha256` for that snapshot. After intentional source edits, remove that generated manifest before validation; packaging creates a new one. If you change dependencies, regenerate the lockfile and dependency/licence inventory and review notices. Run `npm run release:archive` to produce an allowlisted source package. Publishing, deploying, selecting a project licence and changing repository visibility are separate owner decisions.
