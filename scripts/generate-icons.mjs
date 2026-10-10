// Render the canonical vector; Sharp is an authoring tool, not an app dependency.
// Usage: node scripts/generate-icons.mjs [path-to-sharp-module]
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
const render = (svg, size) => sharp(Buffer.from(svg), { density: 192 })
  .resize(size, size).png().toBuffer();

for (const size of [32, 96, 192, 512]) {
  await writeFile(path.join(root, `icons/icon-${size}.png`), await render(source, size));
}
// Extra padding keeps the whole mark within the central 80% safe circle.
const maskable = source.replace('id="editorial-cards"',
  'id="editorial-cards" transform="translate(25.6 25.6) scale(0.9)"');
for (const size of [192, 512]) {
  await writeFile(path.join(root, `icons/icon-maskable-${size}.png`), await render(maskable, size));
}

// PNG entries in an ICO container retain crisp artwork at each native size.
const sizes = [16, 32, 48, 256];
const entries = await Promise.all(sizes.map(size => render(source, size)));
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((entry, i) => {
  const start = 6 + 16 * i;
  header[start] = header[start + 1] = sizes[i] === 256 ? 0 : sizes[i];
  header.writeUInt16LE(1, start + 4);
  header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(entry.length, start + 8);
  header.writeUInt32LE(offset, start + 12);
  offset += entry.length;
});
await writeFile(path.join(root, 'favicon.ico'), Buffer.concat([header, ...entries]));
console.log('Rendered OpenWire editorial cards icons and favicon.');
