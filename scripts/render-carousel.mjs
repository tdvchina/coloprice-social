// Renders carousel defs (content/queue/*.json) to 1080×1350 JPEG slides:
//   out/<slug>/01.jpg … NN.jpg   (this folder is what SLIDES_BASE_URL serves)
//
//   node scripts/render-carousel.mjs                # all queued, not yet published
//   node scripts/render-carousel.mjs <slug|file>    # one
//   node scripts/render-carousel.mjs --all          # include already published
//   node scripts/render-carousel.mjs <slug> --svg   # also write NN.svg next to the JPEGs (debug)
//
// SVG (text outlined from bundled fonts) -> sharp -> mozjpeg. No network, no system fonts.
import sharp from 'sharp';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QUEUE_DIR, OUT_DIR, STATE_FILE, parseArgs, slideFile } from './lib/env.mjs';
import { buildSlide, slideContext } from './lib/slides.mjs';
import { COLORS } from '../config/brand.mjs';

export async function renderCarousel(def, { svg: writeSvg = false } = {}) {
  const ctx = slideContext(def);
  const dir = resolve(OUT_DIR, def.slug);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const issues = [];
  for (let i = 0; i < def.slides.length; i++) {
    const { svg, issues: iss } = buildSlide(def.slides[i], { ...ctx, index: i + 1 });
    iss.forEach((m) => issues.push(`slide ${i + 1} (${def.slides[i].type}): ${m}`));
    if (!svg) continue;
    if (writeSvg) await writeFile(resolve(dir, slideFile(i).replace('.jpg', '.svg')), svg);
    await sharp(Buffer.from(svg), { density: 72 })
      .resize(1080, 1350)
      .flatten({ background: COLORS.void })
      .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toFile(resolve(dir, slideFile(i)));
  }
  return issues;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = parseArgs();
  const only = args._[0];
  const state = existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, 'utf8')) : {};
  const files = (await readdir(QUEUE_DIR)).filter((f) => f.endsWith('.json')).sort();
  let n = 0;
  let failed = 0;
  for (const f of files) {
    if (only && !f.includes(only)) continue;
    const def = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
    if (!only && !args.all && state.published?.[def.slug]) continue;
    const issues = await renderCarousel(def, { svg: Boolean(args.svg) });
    n++;
    if (issues.length) {
      failed++;
      console.error(`✗ ${def.slug} — rendered with ${issues.length} layout issue(s):`);
      issues.forEach((m) => console.error('  - ' + m));
    } else {
      console.log(`✓ ${def.slug} — ${def.slides.length} slides → out/${def.slug}/`);
    }
  }
  if (!n) console.log(only ? `✗ nothing matches "${only}"` : '✓ nothing to render');
  process.exit(failed || (only && !n) ? 1 : 0);
}
