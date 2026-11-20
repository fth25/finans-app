import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const item of ['index.html', 'manifest.json', 'sw.js', 'css', 'icons', 'js']) {
  await cp(path.join(root, item), path.join(output, item), { recursive: true });
}
