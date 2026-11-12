import { readFileSync, readdirSync, existsSync, lstatSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const records = Object.entries(lock.packages).filter(([location]) => location).map(([location, info]) => ({
  location, name: info.name ?? location.split('node_modules/').at(-1), version: info.version,
  licence: info.license ?? 'UNKNOWN', development: Boolean(info.dev), optional: Boolean(info.optional),
  resolved: info.resolved, integrity: info.integrity,
})).sort((a,b) => a.location.localeCompare(b.location, 'en'));
const inventory = { scope: 'Every resolved lockfile entry, including optional platform packages; project licence remains unselected.',
  lockfileVersion: lock.lockfileVersion, packageCount: records.length, packages: records };
writeFileSync(path.join(root, 'docs/dependency-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
const notices = ['THIRD-PARTY PACKAGE NOTICES\n\nCollected from installed package roots on the validation platform. This file does not select a licence for Veyro. Platform-optional packages not installed here are listed in docs/dependency-inventory.json. Review their notices if redistributing their binaries.\n'];
let count = 0;
for (const item of records) {
  const directory = path.join(root, item.location);
  if (!existsSync(directory)) continue;
  for (const file of readdirSync(directory).sort()) {
    if (!/^(licen[cs]e|copying|copyright|notice)([.-].*)?$/i.test(file)) continue;
    const target = path.join(directory, file);
    if (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) continue;
    const content = readFileSync(target, 'utf8');
    notices.push(`\n${'='.repeat(72)}\n${item.name} ${item.version} (${item.location})\nDeclared licence: ${item.licence}\nFile: ${file}\n${'='.repeat(72)}\n${content}\n`);
    count++;
  }
}
writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), notices.join(''));
console.log(`Inventoried ${records.length} lockfile packages; collected ${count} installed-package notice files.`);
