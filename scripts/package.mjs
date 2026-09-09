import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
const name = `vernacue-${version}.zip`;
execFileSync('zip', ['-qr', `../artifacts/${name}`, '.'], { cwd: 'dist' });
const hash = createHash('sha256')
  .update(await readFile(`artifacts/${name}`))
  .digest('hex');
await writeFile(`artifacts/${name}.sha256`, `${hash}  ${name}\n`);
console.log(`artifacts/${name}`);
