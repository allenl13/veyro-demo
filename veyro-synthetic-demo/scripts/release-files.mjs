import { readFileSync, lstatSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function releaseFiles() {
  const files = JSON.parse(readFileSync(path.join(root, 'release-files.json'), 'utf8'));
  if (!Array.isArray(files) || new Set(files).size !== files.length) throw new Error('Unique file allowlist required');
  for (const file of files) {
    if (typeof file !== 'string' || file.startsWith('/') || file.split('/').some(s => !s || s === '.' || s === '..') || /[\r\n\\]/.test(file)) throw new Error('Unsafe release path');
    let current = root;
    for (const segment of file.split('/')) {
      current = path.join(current, segment);
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Release symlink rejected: ${file}`);
    }
    if (!lstatSync(current).isFile()) throw new Error(`Release file missing: ${file}`);
  }
  return files;
}
export function unexpectedFiles(allowed) {
  const ignored = new Set(['node_modules', 'dist', '.demo', 'release', '.git']);
  const result = [];
  const walk = (relative = '') => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (!relative && (ignored.has(entry.name) || entry.name === 'MANIFEST.sha256')) continue;
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(file);
      else if (!allowed.has(file)) result.push(file);
    }
  };
  walk();
  return result;
}
