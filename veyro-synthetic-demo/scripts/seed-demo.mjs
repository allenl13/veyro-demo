import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateDemo } from '../demo/fixtures.ts';
// No path arguments or environment overrides: write only to this checkout's disposable store.
const directory = new URL('../.demo/', import.meta.url);
try { if ((await lstat(directory)).isSymbolicLink()) throw new Error('Demo store must not be a symlink'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(directory, { recursive: true });
const statePath = new URL('state.json', directory);
try { if ((await lstat(statePath)).isSymbolicLink()) throw new Error('Demo state must not be a symlink'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(statePath, JSON.stringify(generateDemo(), null, 2) + '\n', { mode: 0o600 });
console.log(`Synthetic demo seeded: ${fileURLToPath(directory).split('/').at(-2)}/state.json`);
