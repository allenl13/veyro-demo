import { mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root, releaseFiles, unexpectedFiles } from './release-files.mjs';
await import('./check-release.mjs');
const files = releaseFiles();
if (unexpectedFiles(new Set(files)).length) throw new Error('Unexpected source files; run verify:release before packaging');
const out = path.join(root, 'release');
mkdirSync(out, { recursive: true });
if (lstatSync(out).isSymbolicLink()) throw new Error('Symlinked release directory rejected');
const destination = path.join(out, 'veyro-synthetic-demo-0.1.0.tar.gz');
const manifest = files.map(file => `${createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')}  ${file}`).join('\n') + '\n';
writeFileSync(path.join(out, 'MANIFEST.sha256'), manifest);
// Python's standard library provides a deterministic tar/gzip container with no
// owner names, absolute paths, macOS metadata, or inherited source-tree state.
const program = `import sys,json,tarfile,gzip,io,pathlib,zipfile
root=pathlib.Path(sys.argv[1]); dest=pathlib.Path(sys.argv[2]); files=json.loads(sys.argv[3]); manifest=sys.stdin.buffer.read()
with dest.open('wb') as raw:
 with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as zipped:
  with tarfile.open(mode='w',fileobj=zipped,format=tarfile.USTAR_FORMAT) as archive:
   for relative in [*files,'MANIFEST.sha256']:
    data=manifest if relative=='MANIFEST.sha256' else (root/relative).read_bytes()
    info=tarfile.TarInfo('veyro-synthetic-demo/'+relative);info.size=len(data);info.mode=0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=''
    archive.addfile(info,io.BytesIO(data))
with zipfile.ZipFile(dest.with_suffix('').with_suffix('.zip'),'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for relative in [*files,'MANIFEST.sha256']:
  data=manifest if relative=='MANIFEST.sha256' else (root/relative).read_bytes()
  info=zipfile.ZipInfo('veyro-synthetic-demo/'+relative,(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
  archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
`;
const result = spawnSync('python3', ['-c', program, root, destination, JSON.stringify(files)], { input: manifest, encoding: 'utf8' });
if (result.error || result.status !== 0) throw new Error('Packaging requires Python 3; no archive confirmed');
const destinations = [destination, destination.replace(/\.tar\.gz$/, '.zip')];
const sums = destinations.map(file => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${path.basename(file)}`);
writeFileSync(path.join(out, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`Created deterministic tar.gz and ZIP releases (${files.length} allowlisted files plus checksums).\n${sums.join('\n')}`);
