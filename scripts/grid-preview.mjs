// Profile-grid preview: how the @coloprice grid looks once the next queued posts are out.
// Instagram shows the newest post top-left, so the first post published ends up bottom-right.
//
//   node scripts/grid-preview.mjs                    # published + next 9 queued → out/grid-preview.jpg (4:5 tiles)
//   node scripts/grid-preview.mjs --upcoming=3       # only the next 3 queued posts on top of the published ones
//   node scripts/grid-preview.mjs --ratio=3:4        # 3:4 centre crop (current app grid) | 1:1 (legacy square grid)
//   node scripts/grid-preview.mjs --guides           # draw the centre-safe area on each tile
//   node scripts/grid-preview.mjs --out=out/x.jpg
//
// Reads cover slides from out/<slug>/01.jpg (run render-carousel.mjs first).
import sharp from 'sharp';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUEUE_DIR, OUT_DIR, ROOT, parseArgs, bangkokDate } from './lib/env.mjs';
import { loadState } from './validate-carousel.mjs';
import { SLIDE } from '../config/brand.mjs';

const args = parseArgs();
const upcoming = Number(args.upcoming ?? 9);
const ratio = String(args.ratio || '4:5');
const [rw, rh] = ratio.split(':').map(Number);
if (!rw || !rh) throw new Error('--ratio must look like 4:5, 3:4 or 1:1');
const TILE_W = 360;
const TILE_H = Math.round((TILE_W * rh) / rw);
const GAP = 4;
const BG = '#ffffff';

const state = await loadState();
const today = bangkokDate();
const published = Object.entries(state.published || {})
  .sort((a, b) => String(a[1].publishedAt).localeCompare(String(b[1].publishedAt)))
  .map(([slug, p]) => ({ slug, label: p.format, published: true }));
const queued = [];
for (const f of (await readdir(QUEUE_DIR)).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
  if (state.published?.[d.slug] || d.status !== 'ready' || (d.publishBy && d.publishBy < today)) continue;
  queued.push({ slug: d.slug, label: d.format, theme: d.slides?.[0]?.theme || d.theme || 'dark', layout: d.slides?.[0]?.layout || 'standard' });
}
const seq = [...published, ...queued.slice(0, upcoming)];
const tiles = seq.slice(-9).reverse(); // newest first = top-left
if (!tiles.length) {
  console.log('✗ nothing to preview');
  process.exit(1);
}

// crop window inside the 1080×1350 slide (centre crop, like Instagram's grid)
const cropW = Math.min(SLIDE.W, Math.round((SLIDE.H * rw) / rh));
const cropH = Math.min(SLIDE.H, Math.round((SLIDE.W * rh) / rw));
const crop = { left: Math.round((SLIDE.W - cropW) / 2), top: Math.round((SLIDE.H - cropH) / 2), width: cropW, height: cropH };

const rows = Math.ceil(tiles.length / 3);
const W = TILE_W * 3 + GAP * 2;
const H = TILE_H * rows + GAP * (rows - 1);
const comps = [];
for (const [i, t] of tiles.entries()) {
  const src = resolve(OUT_DIR, t.slug, '01.jpg');
  const x = (i % 3) * (TILE_W + GAP);
  const y = Math.floor(i / 3) * (TILE_H + GAP);
  if (!existsSync(src)) {
    console.log(`  ! no cover for ${t.slug} — run render-carousel.mjs`);
    continue;
  }
  let img = sharp(src).extract(crop).resize(TILE_W, TILE_H);
  if (args.guides) {
    // centre-safe area: what survives both the 3:4 and the 1:1 grid crops
    const s = TILE_W / cropW;
    const safeW = Math.min(cropW, Math.round(SLIDE.H * 3 / 4)) * s;
    const safeH = Math.min(cropH, SLIDE.W) * s;
    const g = `<svg width="${TILE_W}" height="${TILE_H}"><rect x="${(TILE_W - safeW) / 2}" y="${(TILE_H - safeH) / 2}" width="${safeW}" height="${safeH}" fill="none" stroke="#ff2d55" stroke-width="2" stroke-dasharray="6 4"/></svg>`;
    img = sharp(await img.toBuffer()).composite([{ input: Buffer.from(g) }]);
  }
  comps.push({ input: await img.jpeg({ quality: 92 }).toBuffer(), left: x, top: y });
}
const out = resolve(ROOT, args.out || 'out/grid-preview.jpg');
await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(comps).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
console.log(`✓ grid preview (${ratio} tiles, newest top-left) → ${out.replace(ROOT + '/', '')}`);
tiles.forEach((t, i) => {
  const pos = `r${Math.floor(i / 3) + 1}c${(i % 3) + 1}`;
  console.log(`  ${pos}  ${t.published ? 'published' : `#${seq.length - i - published.length} queued`.padEnd(9)}  ${t.slug}${t.theme ? `  (${t.theme}, ${t.layout})` : ''}`);
});
