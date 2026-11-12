import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, releaseFiles, unexpectedFiles } from './release-files.mjs';
const files = releaseFiles();
assert.deepEqual(unexpectedFiles(new Set(files)), [], 'Unexpected source files must be reviewed before release');
if (existsSync(path.join(root, 'MANIFEST.sha256'))) {
  const expected = files.map(file => `${createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')}  ${file}`).join('\n') + '\n';
  assert.equal(readFileSync(path.join(root, 'MANIFEST.sha256'), 'utf8'), expected, 'Extracted archive checksum mismatch');
}
const failures = [];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['provider secret', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['absolute owner path', /(?:\/Users\/|\/home\/)[a-zA-Z0-9._-]+\/(?:\.codex|Library|Documents)\//],
];
for (const file of files) {
  if (/(?:^|\/)(?:\.env(?:\..*)?|tracker\.sqlite.*|.*\.(?:log|har|pem|key))$/.test(file) || /(?:^|\/)(?:\.git|captures|backups|state|node_modules|dist)\//.test(file)) failures.push(`${file}: forbidden release material`);
  if (!/\.(?:png|ico)$/.test(file)) {
    const content = readFileSync(path.join(root, file), 'utf8');
    for (const [label, pattern] of patterns) if (pattern.test(content)) failures.push(`${file}: ${label}`);
  }
}
assert.deepEqual(failures, [], 'Candidate privacy scan failed (values are never printed)');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.private, true);
assert.equal(pkg.license, undefined, 'Owner licence decision must remain explicit');
assert.equal(existsSync(path.join(root, 'LICENSE')), false, 'Unexpected project licence');
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const inventory = JSON.parse(readFileSync(path.join(root, 'docs/dependency-inventory.json'), 'utf8'));
const records = Object.entries(lock.packages).filter(([location]) => location);
assert.equal(inventory.packageCount, records.length);
for (const [location, item] of records) {
  const recorded = inventory.packages.find(p => p.location === location);
  assert.equal(recorded?.version, item.version);
  assert.equal(recorded?.licence, item.license ?? 'UNKNOWN');
  assert.notEqual(recorded?.licence, 'UNKNOWN');
}
const generated = JSON.parse(readFileSync(path.join(root, '.demo/state.json'), 'utf8'));
assert.equal(generated.provenance.kind, 'synthetic-demo');
assert.equal(generated.portfolio.autoTrading.enabled, false);
assert.ok(generated.scan.researchUniverse.every(s => /^DEMO[1-7]$/.test(s.ticker) && s.name.includes('(fictional)')));
assert.ok(!files.some(f => f.startsWith('.demo/')));
console.log(`Release check passed: ${files.length} explicit source files, synthetic-only store, no project licence selected.`);
