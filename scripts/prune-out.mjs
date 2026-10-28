// Removes out/<slug>/ for carousels published more than N days ago (default 14).
// Instagram copies the media at publish time, so old slides are no longer needed online.
// Keeps the working tree small; git history still holds them (see SETUP.md on repo size).
//   node scripts/prune-out.mjs [--days=14]
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUT_DIR, parseArgs } from './lib/env.mjs';
import { loadState } from './validate-carousel.mjs';

const days = Number(parseArgs().days || 14);
const state = await loadState();
let n = 0;
for (const [slug, p] of Object.entries(state.published || {})) {
  const dir = resolve(OUT_DIR, slug);
  if (existsSync(dir) && Date.now() - Date.parse(p.publishedAt) > days * 86400000) {
    await rm(dir, { recursive: true, force: true });
    n++;
    console.log(`  pruned out/${slug}/`);
  }
}
console.log(`✓ prune: ${n} folder(s) removed (published > ${days} days ago)`);
