import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
await mkdir('dist/icons', { recursive: true });
await build({
  entryPoints: {
    worker: 'src/background/worker.ts',
    content: 'src/content/index.ts',
    popup: 'src/popup/index.ts',
    options: 'src/options/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  target: 'chrome120',
  format: 'iife',
  loader: { '.css': 'text' },
  minify: false,
  legalComments: 'eof',
});
for (const file of [
  'manifest.json',
  'popup.html',
  'options.html',
  'ui.css',
  'LICENSE',
  'PRIVACY.md',
])
  await copyFile(file, `dist/${file}`);
// Original geometric V mark. Generate PNGs without downloaded assets or dependencies.
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type),
    n = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([n, tag, data, crc]);
}
for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const stroke =
        v > 0.22 && v < 0.78 && Math.abs(Math.abs(u - 0.5) - (0.78 - v) * 0.42) < 0.065;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw.set(stroke ? [239, 245, 253, 255] : [36, 91, 176, 255], i);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    `dist/icons/${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
console.log('Built unpacked extension in dist/');
