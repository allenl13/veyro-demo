import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Candidate server does not inherit owner/provider secrets or runtime path overrides.
const env = Object.fromEntries(['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR'].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const seed = spawn(process.execPath, ['--experimental-strip-types', 'scripts/seed-demo.mjs'], { cwd: root, env, stdio: 'inherit' });
seed.on('exit', code => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  const preview = process.argv.includes('--preview');
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: root, env, stdio: 'inherit' });
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', code => { process.exitCode = code ?? 0; });
});
