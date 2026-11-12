# Dependencies and licence inventory

The exact lockfile has **401 resolved package entries**, including development tools and optional binaries for other platforms. The inventory is derived from `package-lock.json`, not a list of only top-level names. React and React DOM are the two direct runtime dependencies; the other direct packages support builds, types and linting.

`dependency-inventory.json` records each lockfile location, name, version, declared licence, development/optional flags, registry URL and integrity. On the validation platform, **319 installed lockfile entries** were available and **313 notice files** were collected in `THIRD_PARTY_NOTICES.txt`. Optional packages absent on this machine still appear in the inventory.

| Declared licence | Lockfile entries |
| --- | ---: |
| 0BSD | 2 |
| Apache-2.0 | 19 |
| BSD-2-Clause | 8 |
| BSD-3-Clause | 3 |
| BlueOak-1.0.0 | 1 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 1 |
| ISC | 12 |
| MIT | 328 |
| MPL-2.0 | 25 |
| Python-2.0 | 1 |

All entries have declared licence metadata. These declarations have not been independently adjudicated. `npm run` does not consult this inventory at runtime; `verify:release` checks that the inventory still agrees with the lockfile.

## Review points

- Preserve MIT, ISC, BSD, Apache and other upstream notices when required by the form of redistribution. Collected full notice texts are retained; the app's future project licence cannot replace them.
- MPL-2.0 entries are `axe-core` (accessibility tooling) and two `lightningcss` version families plus their platform binaries (build tooling). These are not a project-wide licence choice. If modified covered files or their binaries are redistributed, review the applicable source/notice obligations. The source archive contains no vendored package implementation or native binaries.
- `caniuse-lite` declares CC-BY-4.0 (build metadata), `argparse` Python-2.0, `language-subtag-registry` CC0-1.0, and one nested `minimatch` BlueOak-1.0.0. Preserve the corresponding notices/attributions for future distributions as applicable.
- The main production browser bundle includes React-family runtime code and compiled app code. This archive distributes the source and lockfile, not that bundle. Review the bundled distribution's licences/notices separately before hosting or publishing compiled output.
- System fonts need no bundled font asset. The retained favicon and app styling/code still require the owner's authorship/rights confirmation. No third-party imagery, provider data capture or historical portfolio record is bundled.
- No live vulnerability advisory query was completed. An offline install's cached advisory output is not a fresh security audit. Run a current dependency/advisory review before publication.

## Updating the inventory

After an intentional dependency change, regenerate the lockfile using the supported Node/npm versions, install with `npm ci`, then run:

```sh
node scripts/inventory-dependencies.mjs
npm run verify:release
```

The notices collected depend on which platform-optional packages are installed. Do not present this file as a complete compliance conclusion for binaries built on a different platform. The project licence remains unselected; see `LICENCE_DECISION.md`.
