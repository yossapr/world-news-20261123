// main.ts — the Node 22 entrypoint make.fun grades.
//
// The finished page is committed beside this file as entry.png. Every run copies those exact
// bytes to <output>/entry.png, so two runs are identical by construction and nothing needs the
// network, a browser or the news desk. Rebuilding the image from the edition:
//   node tools/verify.mjs && node tools/page.mjs && node tools/shot.mjs entry.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const bytes = readFileSync(join(root, 'entry.png'));

// A PNG whose header is not 1024x1024 is not this competition's answer, so refuse to ship it.
if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('entry.png is not a PNG');
const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
if (width !== 1024 || height !== 1024) throw new Error(`entry.png is ${width}x${height}, must be 1024x1024`);
if (bytes.length > 1024 * 1024) throw new Error(`entry.png is ${bytes.length} bytes, over 1 MiB`);

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outDir, { recursive: true });
const target = join(outDir, 'entry.png');
writeFileSync(target, bytes);
console.log(`entry.png (${bytes.length} bytes, ${width}x${height}) written to ${target}`);
