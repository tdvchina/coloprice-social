// News intake: public RSS/Atom feeds (config/feeds.json) -> content/inbox/<YYYY-MM-DD>.json
// Input for the carousel-writer routine (Claude picks ONE item, verifies it at the
// original URL and writes the carousel). Nothing here is published anywhere.
//
//   node scripts/intake-news.mjs                 # last 72h, merge into today's inbox file
//   node scripts/intake-news.mjs --hours=48 --max=60 --keep-days=14
//   node scripts/intake-news.mjs --check-feeds   # only report feed health
import { XMLParser } from 'fast-xml-parser';
import { readFile, readdir, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, INBOX_DIR, QUEUE_DIR, parseArgs, bangkokDate } from './lib/env.mjs';

const args = parseArgs();
const HOURS = Number(args.hours || 72);
const MAX = Number(args.max || 60);
const KEEP_DAYS = Number(args['keep-days'] || 14);
const UA = process.env.INTAKE_USER_AGENT || 'Mozilla/5.0 (compatible; ColopriceNewsIntake/1.0; +https://coloprice.com)';

const { feeds } = JSON.parse(await readFile(resolve(ROOT, 'config/feeds.json'), 'utf8'));

// ── relevance scoring ──
const DC = /\b(data ?cent(er|re)s?|datacenters?|colocation|colo\b|hyperscale|hyperscaler|ai (factory|campus|infrastructure)|server farm)/i;
const RULES = [
  [DC, 4],
  [/\bcolocation|wholesale|retail colo|interconnection\b/i, 3],
  [/\b(gpu|gpus|h100|h200|b200|b300|gb200|gb300|blackwell|rubin|mi300x|mi355x|accelerator)s?\b/i, 3],
  [/\b\d[\d.,]*\s?(mw|gw|megawatts?|gigawatts?)\b/i, 4],
  [/\$\s?\d[\d.,]*\s?(bn|billion|b\b|million|m\b)|\b\d[\d.,]*\s?(billion|million) (dollars|usd)/i, 3],
  [/\b(price|pricing|rent|rents|rental|lease|leasing|vacancy|absorption|per kw|\/kw|tariff)\b/i, 3],
  [/\b(power|grid|ppa|substation|nuclear|smr|gas turbine|interconnect queue|transmission)\b/i, 1],
  [/\b(singapore|malaysia|johor|thailand|bangkok|indonesia|jakarta|batam|vietnam|philippines|india|mumbai|japan|tokyo|korea|australia|sydney|hong kong|taiwan)\b/i, 2],
  [/\b(liquid cooling|immersion|direct-to-chip)\b/i, 1],
  [/\b(acquire|acquisition|joint venture|funding|raises|financing|ipo|capex)\b/i, 1],
  [/\b(webinar|podcast|sponsored|award|appoints?|hires?|named (ceo|cfo|president)|whitepaper|ebook|event recap)\b/i, -4],
];
const FIGURE = /(\$\s?\d[\d.,]*\s?(?:bn|billion|million|m|b|k)?\b|\b\d[\d.,]*\s?(?:mw|gw|kw|megawatts?|gigawatts?|%|percent|gpus?|racks?|acres|sq ?ft|square feet|billion|million)\b)/gi;

function score(text, kind) {
  let s = 0;
  const hits = [];
  for (const [re, w] of RULES) {
    if (re.test(text)) {
      s += w;
      if (w > 0) hits.push(re.source.slice(0, 24));
    }
  }
  if (kind === 'general' && !DC.test(text) && !/\b(gpu|gpus|colocation)\b/i.test(text)) return { s: -99, hits };
  if (kind === 'press' && !DC.test(text) && !/\b(gpu|ai infrastructure|supercomputer)\b/i.test(text)) s -= 3;
  return { s, hits };
}

// ── helpers ──
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENT[e] ?? m;
  });
}
function clean(html) {
  // feeds double-encode HTML in descriptions (&lt;p&gt;…), so decode before AND after stripping tags
  const stripTags = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const once = stripTags(decode(stripTags(String(html ?? '').replace(/<!\[CDATA\[|\]\]>/g, ''))));
  return decode(once).replace(/\s+/g, ' ').trim();
}
const text = (v) => (v == null ? '' : typeof v === 'object' ? clean(v['#text'] ?? v.__cdata ?? '') : clean(v));
function normUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|mc_|fbclid|gclid|ref$)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return x.toString().replace(/\/$/, '');
  } catch {
    return String(u || '').trim();
  }
}
const titleKey = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);

function atomLink(l) {
  const arr = Array.isArray(l) ? l : [l];
  const alt = arr.find((x) => x && typeof x === 'object' && (!x['@_rel'] || x['@_rel'] === 'alternate')) || arr[0];
  return typeof alt === 'object' ? alt?.['@_href'] : alt;
}

const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata', processEntities: false, htmlEntities: false });

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const doc = parser.parse(xml);
    const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((it) => {
      const title = text(it.title);
      const url = typeof it.link === 'string' ? it.link.trim() : atomLink(it.link) || text(it.guid);
      const date = text(it.pubDate || it.published || it.updated || it['dc:date']);
      const summary = text(it.description || it.summary || it['content:encoded'] || it.content);
      return { title, url: normUrl(url), date, summary };
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── already seen: previous inbox files + sources used in the queue ──
await mkdir(INBOX_DIR, { recursive: true });
const seenUrls = new Set();
const seenTitles = new Set();
const today = bangkokDate();
const inboxFiles = (await readdir(INBOX_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
for (const f of inboxFiles) {
  if (f === `${today}.json`) continue;
  const ageDays = (Date.parse(today) - Date.parse(f.slice(0, 10))) / 86400000;
  if (ageDays > KEEP_DAYS && !args['check-feeds']) {
    await unlink(resolve(INBOX_DIR, f));
    continue;
  }
  const j = JSON.parse(await readFile(resolve(INBOX_DIR, f), 'utf8'));
  for (const it of j.items || []) {
    seenUrls.add(it.url);
    seenTitles.add(titleKey(it.title));
  }
}
const usedUrls = new Set();
if (existsSync(QUEUE_DIR)) {
  for (const f of (await readdir(QUEUE_DIR)).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
    for (const s of d.sources || []) usedUrls.add(normUrl(s.url));
  }
}

// ── fetch all feeds ──
const since = Date.now() - HOURS * 3600_000;
const health = [];
const fresh = [];
await Promise.all(
  feeds.map(async (feed) => {
    try {
      const items = await fetchFeed(feed);
      let kept = 0;
      for (const it of items) {
        if (!it.title || !/^https?:\/\//.test(it.url)) continue;
        const t = Date.parse(it.date);
        if (!Number.isFinite(t) || t < since || t > Date.now() + 6 * 3600_000) continue;
        const { s, hits } = score(`${it.title} ${it.summary}`, feed.kind);
        if (s < 3) continue;
        const figures = [...new Set(`${it.title} ${it.summary}`.match(FIGURE) || [])].slice(0, 8);
        fresh.push({
          id: createHash('sha1').update(it.url).digest('hex').slice(0, 12),
          title: it.title,
          url: it.url,
          date: new Date(t).toISOString(),
          publisher: feed.name,
          feed: feed.id,
          kind: feed.kind,
          summary: it.summary.slice(0, 600),
          figures,
          score: s,
          used: usedUrls.has(it.url) || undefined,
        });
        kept++;
      }
      health.push({ id: feed.id, ok: true, items: items.length, kept });
    } catch (e) {
      health.push({ id: feed.id, ok: false, error: String(e.message || e) });
    }
  }),
);
health.sort((a, b) => a.id.localeCompare(b.id));

if (args['check-feeds']) {
  for (const h of health) console.log(`${h.ok ? '✓' : '✗'} ${h.id.padEnd(13)} ${h.ok ? `${h.items} items, ${h.kept} relevant in ${HOURS}h` : h.error}`);
  process.exit(health.every((h) => !h.ok) ? 1 : 0);
}

// ── merge with today's file, dedupe, rank ──
const outFile = resolve(INBOX_DIR, `${today}.json`);
const prev = existsSync(outFile) ? JSON.parse(await readFile(outFile, 'utf8')) : { items: [] };
const byUrl = new Map();
const titles = new Set();
for (const it of [...prev.items, ...fresh]) {
  const tk = titleKey(it.title);
  if (seenUrls.has(it.url) || seenTitles.has(tk)) continue; // surfaced on an earlier day
  if (byUrl.has(it.url) || titles.has(tk)) continue;
  byUrl.set(it.url, it);
  titles.add(tk);
}
const items = [...byUrl.values()]
  .sort((a, b) => b.score - a.score || Date.parse(b.date) - Date.parse(a.date))
  .slice(0, MAX);

await writeFile(
  outFile,
  JSON.stringify({ generated: new Date().toISOString(), windowHours: HOURS, feeds: health, items }, null, 2) + '\n',
);
const okFeeds = health.filter((h) => h.ok).length;
console.log(`✓ inbox ${today}: ${items.length} candidate(s) from ${okFeeds}/${health.length} feeds → content/inbox/${today}.json`);
for (const h of health.filter((x) => !x.ok)) console.log(`  ✗ feed ${h.id}: ${h.error}`);
for (const it of items.slice(0, 8)) console.log(`  [${String(it.score).padStart(2)}] ${it.publisher}: ${it.title}`);
if (!okFeeds) process.exit(1);
