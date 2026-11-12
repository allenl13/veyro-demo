# Security and data handling

The candidate binds to loopback and has no authentication, provider credentials, broker, writable portfolio API or scheduler. It is intended for a local synthetic demonstration. Do not expose the preview server publicly or use the browser demo adapter as a production access-control system.

Run the documented setup in this directory. No `.env` file is needed. The seed/store path is fixed and symlink checks prevent normal setup from writing through an externally linked demo store. Environment loading is disabled and server subprocesses use a small environment allowlist. Source packaging is explicit rather than a recursive copy of a workspace.

Before a later publication, inspect the archive itself for credentials, owner paths/identifiers, history, logs, captures, local state and accidental files. `npm run verify:release` provides a bounded allowlist and common credential-pattern check; it is not a guarantee that arbitrary new files contain no secrets. Never paste a discovered secret into an issue or scan report. Rotate it through its issuing service and remove it from the publication candidate.

No public security-reporting contact has been selected. Until publication, report concerns privately to the project owner through an existing trusted channel. A future repository should add a private reporting route before accepting security reports. Include affected component, reproduction steps and impact; omit credentials and personal records.

Dependency versions are locked, but a live advisory check is not part of the offline verification evidence. Perform a fresh advisory review before publication and after dependency changes. CI, hosting headers, authentication and operational hardening must be designed separately if this demo is later extended into a hosted system.
