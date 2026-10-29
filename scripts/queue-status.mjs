// Queue summary. Writes ready=<n> to $GITHUB_OUTPUT when run in Actions.
//   node scripts/queue-status.mjs [--json]
import { readFile, readdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { QUEUE_DIR, parseArgs, bangkokDate } from './lib/env.mjs';
import { loadState } from './validate-carousel.mjs';

const args = parseArgs();
const state = await loadState();
const today = bangkokDate();
const rows = [];
for (const f of (await readdir(QUEUE_DIR)).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
  let st = d.status;
  if (state.published?.[d.slug]) st = 'published';
  else if (d.publishBy && d.publishBy < today) st = 'expired';
  rows.push({ file: f, slug: d.slug, format: d.format, status: st, publishBy: d.publishBy || null });
}
const ready = rows.filter((r) => r.status === 'ready');
const lastFormats = Object.entries(state.published || {})
  .sort((a, b) => String(b[1].publishedAt).localeCompare(String(a[1].publishedAt)))
  .slice(0, 5)
  .map(([, p]) => p.format);
if (args.json) console.log(JSON.stringify({ today, ready: ready.length, lastFormats, rows }, null, 2));
else {
  for (const r of rows) console.log(`${r.status.padEnd(9)} ${r.format.padEnd(18)} ${r.file}${r.publishBy ? `  (publish by ${r.publishBy})` : ''}`);
  console.log(`→ ${ready.length} ready to publish; last formats: ${lastFormats.join(', ') || '—'}`);
}
// Thursday (Asia/Bangkok) is the fixed Coloprice Top slot: the writer must run if none is queued, however full the queue.
const thursday = new Date(`${today}T12:00:00Z`).getUTCDay() === 4;
const topQueued = ready.some((r) => r.format === 'coloprice-top');
const topNeeded = thursday && !topQueued;
if (topNeeded) console.log('→ Thursday: no Coloprice Top in the queue — the writer will write one');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `ready=${ready.length}\ntop_needed=${topNeeded}\n`);
