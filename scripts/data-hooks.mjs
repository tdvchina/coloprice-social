// Coloprice data hooks -> content/data/coloprice-latest.json (read-only snapshot for the writer).
//
// Two sources, never written to:
//   remote (default, works in CI): public CC BY endpoints on coloprice.com
//     /data/colocation-price-index.json, /data/gpu-price-index.json,
//     /api/history/colo-index.json, /api/history/gpu-prices.json,
//     /data/data-center-pipeline.csv, /data/transactions.csv, /data/data-center-incidents.csv
//   local (--local=<colocationindex/src/data> or COLOPRICE_DATA_DIR): the site's own data files —
//     adds capacity-watch.json (no public JSON endpoint yet) and richer incident/deal fields.
//
// In CI the local folder does not exist: local-only sections (capacityWatch) are kept from
// the committed snapshot with their original asOf, so staleness is visible to the writer.
//
//   node scripts/data-hooks.mjs
//   node scripts/data-hooks.mjs --local="/Users/misscarol/Artem Claude/colocationindex/src/data"
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR, parseArgs, loadEnv } from './lib/env.mjs';

loadEnv();
const args = parseArgs();
const BASE = (process.env.COLOPRICE_BASE_URL || 'https://coloprice.com').replace(/\/$/, '');
const LOCAL = args.local === true ? null : args.local || process.env.COLOPRICE_DATA_DIR || null;
const OUT = resolve(DATA_DIR, 'coloprice-latest.json');

const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : { datasets: {} };

async function getText(path) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': 'coloprice-social/1.0 (+https://coloprice.com)' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}
const getJson = async (p) => JSON.parse(await getText(p));
async function readLocal(name) {
  if (!LOCAL) return null;
  const p = resolve(LOCAL, name);
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, 'utf8'));
}

function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const rows = lines.map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') out.push(cur), (cur = '');
      else cur += c;
    }
    out.push(cur);
    return out;
  });
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
const csvComment = (text) => (text.split('\n').find((l) => l.startsWith('#')) || '').replace(/^#\s*/, '');
const num = (v) => (v === '' || v == null ? null : Number(v));
const usd = (v) => (v == null ? 'n/a' : `$${v}`);

/** Keep month-end points + the last point, so the file stays small but charts still work. */
function thin(series) {
  const out = {};
  for (const [k, pts] of Object.entries(series || {})) {
    const byMonth = new Map();
    for (const p of pts) byMonth.set(String(p[0]).slice(0, 7), p);
    out[k] = [...byMonth.values()];
  }
  return out;
}

const lastDate = (series) => Object.values(series || {}).flat().map((p) => String(p[0])).sort().pop() || null;

const datasets = { ...prev.datasets };
const errors = [];
async function step(name, fn) {
  try {
    datasets[name] = await fn();
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
  }
}

await step('colo', async () => {
  const local = await readLocal('index-data.json');
  const d = local || (await getJson('/data/colocation-price-index.json'));
  const markets = d.markets
    .filter((m) => m.wholesaleUsdKwMo != null)
    .map((m) => ({ slug: m.slug, name: m.name?.en || m.slug, wholesaleUsdKwMo: m.wholesaleUsdKwMo, wholesaleRange: m.wholesaleRange || null, retailRackUsdMo: m.retailRackUsdMo || null, yoyPct: m.yoyPct ?? null, source: m.source }));
  return {
    title: 'Coloprice Colocation Price Index (wholesale, USD per kW per month)',
    citeAs: 'Coloprice Colocation Price Index',
    url: `${BASE}/data/colocation-price-index.json`,
    page: `${BASE}/index/`,
    asOf: d.updated,
    period: d.period,
    markets,
    facts: markets.map((m) => `${m.name}: wholesale ${usd(m.wholesaleUsdKwMo)}/kW/month${m.yoyPct != null ? `, ${m.yoyPct >= 0 ? '+' : ''}${m.yoyPct}% YoY` : ''} (underlying source: ${m.source?.label || 'n/a'})`),
  };
});

await step('gpu', async () => {
  const local = await readLocal('gpu-prices.json');
  const d = local || (await getJson('/data/gpu-price-index.json'));
  const gpus = d.gpus.map((g) => ({ model: g.model, vramGb: g.vramGb, median: g.onDemandUsdHr?.median ?? null, min: g.onDemandUsdHr?.min ?? null, max: g.onDemandUsdHr?.max ?? null, contract1y: g.contract1yUsdHr ?? null }));
  return {
    title: 'Coloprice GPU Rental Price Index (USD per GPU-hour)',
    citeAs: 'Coloprice GPU Rental Price Index',
    url: `${BASE}/data/gpu-price-index.json`,
    page: `${BASE}/gpu/`,
    asOf: d.updated,
    gpus,
    facts: gpus.map((g) => `${g.model}: on-demand median ${usd(g.median)}/GPU-hr, low ${usd(g.min)}, high ${usd(g.max)}, 1-year contract ${usd(g.contract1y)}`),
  };
});

await step('gpuHistory', async () => {
  const d = (await readLocal('history/gpu-prices.json')) || (await getJson('/api/history/gpu-prices.json'));
  return { title: 'GPU rental price history', asOf: lastDate(d.series), url: `${BASE}/api/history/gpu-prices.json`, format: d.meta?.format || ['date', 'median', 'min', 'max', 'contract1y'], unit: 'USD per GPU-hour', series: thin(d.series) };
});

await step('coloHistory', async () => {
  const d = (await readLocal('history/colo-index.json')) || (await getJson('/api/history/colo-index.json'));
  return { title: 'Wholesale colocation price history', asOf: lastDate(d.series), url: `${BASE}/api/history/colo-index.json`, format: d.meta?.format || ['date', 'usdPerKwMonth'], unit: 'USD per kW per month', series: thin(d.series) };
});

await step('pipeline', async () => {
  const text = await getText('/data/data-center-pipeline.csv');
  const rows = parseCsv(text).map((r) => ({ level: r.level, name: r.name, projects: num(r.projects), underConstructionMw: num(r.under_construction_mw), announcedMw: num(r.announced_mw) }));
  return {
    title: 'Coloprice data center construction pipeline (published capacity only)',
    citeAs: 'Coloprice pipeline tracker',
    url: `${BASE}/data/data-center-pipeline.csv`,
    page: `${BASE}/pipeline/`,
    asOf: new Date().toISOString().slice(0, 10),
    note: csvComment(text),
    // all countries: a top-N cut made regional totals look smaller than they are
    rows: rows.filter((r) => r.level === 'total' || r.level === 'country'),
  };
});

await step('transactions', async () => {
  const local = await readLocal('transactions.json');
  let deals;
  if (local) {
    deals = local.deals.map((d) => ({ target: d.target, buyer: [].concat(d.buyer).join(' + '), seller: d.seller, valueUsdB: d.valueUsdB ?? null, type: d.type, announced: d.announced, closed: d.closed || null, assets: d.assetsNote || '', source: d.sources?.[0] || null }));
  } else {
    deals = parseCsv(await getText('/data/transactions.csv')).map((r) => ({ target: r.target, buyer: r.buyer, seller: r.seller, valueUsdB: num(r.value_usd_b), type: r.type, announced: r.announced, closed: r.closed || null, assets: r.assets, source: { label: r.source_label, url: r.source_url } }));
  }
  return { title: 'Coloprice data center M&A tracker', citeAs: 'Coloprice M&A tracker', url: `${BASE}/data/transactions.csv`, page: `${BASE}/transactions/`, asOf: local?.updated || new Date().toISOString().slice(0, 10), deals };
});

await step('incidents', async () => {
  const local = await readLocal('incidents.json');
  let list;
  let asOf;
  if (local) {
    list = local.incidents.map((i) => ({ date: i.date, title: i.title, operator: i.operator, location: i.location, cause: i.cause, durationHours: i.durationHours ?? null, impact: i.impact, source: i.source }));
    asOf = local.updated;
  } else {
    const text = await getText('/data/data-center-incidents.csv');
    list = parseCsv(text).map((r) => ({ date: r.date, title: r.title, operator: r.operator, location: r.location, cause: r.cause, durationHours: num(r.duration_hours), source: { label: r.source_label, url: r.source_url } }));
    asOf = (csvComment(text).match(/updated (\d{4}-\d{2}-\d{2})/) || [])[1];
  }
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { title: 'Coloprice data center incident database', citeAs: 'Coloprice incident database', url: `${BASE}/data/data-center-incidents.csv`, page: `${BASE}/incidents/`, asOf, recent: list.slice(0, 15), total: list.length };
});

// local-only: capacity watch (public page exists, no JSON endpoint)
const cw = await readLocal('capacity-watch.json');
if (cw) {
  datasets.capacityWatch = {
    title: 'Coloprice Capacity Watch (public MW statements)',
    citeAs: 'Coloprice Capacity Watch',
    url: `${BASE}/capacity-watch/`,
    page: `${BASE}/capacity-watch/`,
    asOf: cw.updated,
    note: cw.note,
    statements: [...cw.statements].sort((a, b) => b.date.localeCompare(a.date)).map((s) => ({ date: s.date, party: s.party, country: s.country, market: s.market, kind: s.kind, mw: s.mw, unit: s.unit, statement: s.statement, source: s.source })),
  };
} else if (datasets.capacityWatch) {
  datasets.capacityWatch.staleNote = 'Kept from the last local export (no public JSON endpoint). Re-export with --local to refresh.';
}

await mkdir(DATA_DIR, { recursive: true });
const out = { generated: new Date().toISOString(), base: BASE, mode: LOCAL ? 'local+remote' : 'remote', license: 'Coloprice data: CC BY 4.0 (own data). Read-only snapshot.', errors, datasets };
await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`✓ data hooks (${out.mode}) → content/data/coloprice-latest.json`);
for (const [k, v] of Object.entries(datasets)) console.log(`  ${k.padEnd(14)} asOf ${v.asOf || '—'}${v.staleNote ? '  (stale: local-only)' : ''}`);
for (const e of errors) console.log(`  ✗ ${e}`);
if (errors.length && Object.keys(datasets).length === 0) process.exit(1);
