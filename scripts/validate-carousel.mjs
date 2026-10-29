// Carousel validator — HARD GATE. publish.mjs refuses anything that fails here,
// and the writer routine must run it until it reports zero errors.
//
//   node scripts/validate-carousel.mjs <slug|file>     # one
//   node scripts/validate-carousel.mjs --all           # every queued file
//
// What it enforces (see content/FORMAT.md for the schema):
//   schema · 7 recurring formats · cover first / closing last · 3–10 slides
//   every news fact sourced (URL + date), every number on a slide present in the facts
//   of the sources/data hooks that slide cites (or in `derived`) · caption rules
//   (hook number first line, "Data:/Sources:" line, "link in bio", no URLs, coloprice.com
//   at most once per 3 posts) · 3–5 hashtags · no investment advice · no client/deal info
//   (generic patterns + CONTENT_DENYLIST env) · glyphs exist in bundled fonts · layout fits.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QUEUE_DIR, STATE_FILE, parseArgs, loadEnv, bangkokDate } from './lib/env.mjs';
import { buildSlide, slideContext, stripMarks, COVER_LAYOUTS } from './lib/slides.mjs';
import { THEMES } from '../config/brand.mjs';
import { REGIONS } from './lib/map.mjs';
import { FONTS, unsupportedChars } from './lib/text.mjs';
import { numbersIn, same, derivedNumbers, factNumbers, missingNumbers, safetyErrors } from './lib/rules.mjs';
import { xPostErrors } from './lib/xpost.mjs';
import { readFileSync } from 'node:fs';

// Official Instagram/X accounts of operators (config/handles.json, each with evidence). Mentions and
// user tags may only use handles from this file: a guessed handle can tag an impostor account.
const HANDLES_FILE = new URL('../config/handles.json', import.meta.url);
export function loadHandles() {
  try { return JSON.parse(readFileSync(HANDLES_FILE, 'utf8')).operators || {}; } catch { return {}; }
}
export const MENTION_RE = /(^|[\s(])@([A-Za-z0-9._]{1,30})/g;
const MAX_MENTIONS = 8;
const MAX_USER_TAGS = 6;

export { numbersIn }; // kept here for older imports (tests, routines)

export const FORMATS = {
  'index-weekly-move': { label: 'Coloprice Index: Weekly Move', needsData: true },
  'gpu-rent-check': { label: 'GPU Rent Check', needsData: true },
  'megawatt-watch': { label: 'Megawatt Watch', needsNews: true },
  'map-of-the-week': { label: 'Map of the Week', needsData: true },
  ranked: { label: 'Ranked' },
  'coloprice-top': { label: 'Coloprice Top', needsData: true },
  'deal-sheet': { label: 'Deal Sheet', needsNews: true },
  'outage-files': { label: 'Outage Files', needsNews: true },
  explainer: { label: 'Explainer' },
};
const SLIDE_TYPES = ['cover', 'stat', 'list', 'chart', 'compare', 'map', 'quote', 'closing'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BANNED_TAGS = ['#explore', '#reels', '#tech', '#fyp', '#viral', '#instagood', '#follow', '#like4like', '#explorepage'];

function slideTexts(s) {
  const t = [];
  const push = (v) => v != null && v !== '' && t.push(stripMarks(v));
  const compareTexts = () => {
    for (const it of s.items || []) push(it.label), push(it.value), push(it.note);
    if (s.verdict) push(s.verdict.value), push(s.verdict.text);
  };
  const mapTexts = () => {
    for (const p of s.points || []) push(p.label), push(p.valueLabel);
  };
  switch (s.type) {
    case 'cover':
      push(s.kicker), push(s.headline), push(s.deck), push(s.statement);
      if (s.figure) push(s.figure.value), push(s.figure.label);
      if (s.layout === 'compare') compareTexts();
      if (s.layout === 'map') mapTexts();
      break;
    case 'compare':
      push(s.title), push(s.unit), push(s.caption);
      compareTexts();
      break;
    case 'map':
      push(s.title), push(s.unit), push(s.caption);
      mapTexts();
      break;
    case 'quote':
      push(s.label), push(s.text), push(s.attribution);
      break;
    case 'stat':
      push(s.label), push(s.value), push(s.unit), push(s.context), push(s.delta?.value);
      break;
    case 'list':
      push(s.title), push(s.unit), push(s.footnote);
      for (const r of s.rows || []) push(r.label), push(r.value), push(r.note), push(r.delta?.value);
      break;
    case 'chart':
      push(s.title), push(s.unit), push(s.caption);
      for (const d of s.data || []) push(d.label);
      break;
    case 'closing':
      push(s.text), push(s.cta);
      break;
  }
  return t;
}

export function validateCarousel(def, { file, state = {}, env = process.env, fit = true } = {}) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  // ── top-level schema ──
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.slug || '') || def.slug.length > 60) E('slug: kebab-case, ≤60 chars');
  if (file && !new RegExp(`^\\d{3}-${def.slug}\\.json$`).test(basename(file))) E(`file name must be NNN-${def.slug}.json (got ${basename(file)})`);
  if (!FORMATS[def.format]) E(`format must be one of: ${Object.keys(FORMATS).join(', ')}`);
  if (!['ready', 'draft'].includes(def.status)) E('status must be "ready" or "draft"');
  if (!DATE.test(def.created || '')) E('created: YYYY-MM-DD');
  if (def.publishBy != null && (!DATE.test(def.publishBy) || def.publishBy < def.created)) E('publishBy: YYYY-MM-DD on/after created');
  if (!def.topic) E('topic: short internal label required');
  if (def.theme != null && !THEMES[def.theme]) E(`theme must be one of: ${Object.keys(THEMES).join(', ')}`);

  // ── sources & data hooks ──
  const ids = new Set();
  const refFacts = {};
  const today = bangkokDate();
  for (const [i, s] of (def.sources || []).entries()) {
    const at = `sources[${i}]`;
    if (!s.id || ids.has(s.id)) E(`${at}.id missing or duplicate`);
    ids.add(s.id);
    if (!s.publisher) E(`${at}.publisher required`);
    if (!s.title) E(`${at}.title required`);
    if (!/^https:\/\/[^\s]+$/.test(s.url || '') || /google\.com\/url/.test(s.url)) E(`${at}.url must be a direct https URL`);
    if (!DATE.test(s.date || '')) E(`${at}.date: YYYY-MM-DD (publication date) required`);
    else if (s.date > today) E(`${at}.date is in the future`);
    if (!Array.isArray(s.facts) || !s.facts.length) E(`${at}.facts: list the facts (with their numbers) taken from this source`);
    refFacts[s.id] = [...(s.facts || []), s.date || ''];
  }
  for (const [i, d] of (def.dataHooks || []).entries()) {
    const at = `dataHooks[${i}]`;
    if (!d.id || ids.has(d.id)) E(`${at}.id missing or duplicate`);
    ids.add(d.id);
    if (!d.dataset) E(`${at}.dataset required`);
    if (!/^https:\/\/(www\.)?coloprice\.com\//.test(d.url || '')) E(`${at}.url must be a public coloprice.com URL`);
    if (!DATE.test(d.asOf || '')) E(`${at}.asOf: YYYY-MM-DD required`);
    if (!Array.isArray(d.facts) || !d.facts.length) E(`${at}.facts required`);
    refFacts[d.id] = [...(d.facts || []), d.asOf || ''];
  }
  const fmt = FORMATS[def.format] || {};
  if (fmt.needsNews && !(def.sources || []).length) E(`format ${def.format} needs at least one news source`);
  if (fmt.needsData && !(def.dataHooks || []).length) E(`format ${def.format} needs at least one Coloprice data hook`);
  if (fmt.needsNews && (def.sources || []).length && DATE.test(def.created || '')) {
    const newest = (def.sources || []).map((s) => s.date).sort().pop();
    if (newest && (Date.parse(def.created) - Date.parse(newest)) / 86400000 > 7) W(`newest news source is ${newest} — older than 7 days for a news format`);
  }
  for (const d of def.derived || []) if (!d.value || !d.how) E('derived[]: each needs value + how (the arithmetic, from cited facts)');
  const derivedNums = derivedNumbers(def);

  // ── slides ──
  const slides = def.slides || [];
  if (slides.length < 3 || slides.length > 10) E(`slides: 3–10 required (Instagram carousel max 10), got ${slides.length}`);
  if (slides[0]?.type !== 'cover') E('slide 1 must be type "cover"');
  if (slides[slides.length - 1]?.type !== 'closing') E('last slide must be type "closing"');
  const used = new Set();
  slides.forEach((s, i) => {
    const at = `slide ${i + 1} (${s.type})`;
    if (!SLIDE_TYPES.includes(s.type)) return E(`${at}: unknown type`);
    if (i > 0 && i < slides.length - 1 && (s.type === 'cover' || s.type === 'closing')) E(`${at}: cover/closing only first/last`);
    const refs = s.refs || [];
    refs.forEach((r) => (ids.has(r) ? used.add(r) : E(`${at}: ref "${r}" not in sources/dataHooks`)));
    const needsRefs = s.type !== 'closing';
    if (needsRefs && !refs.length) E(`${at}: refs[] required — every data slide names its source(s)`);
    // required fields
    if (s.theme != null && !THEMES[s.theme]) E(`${at}: theme must be one of: ${Object.keys(THEMES).join(', ')}`);
    if (s.type === 'cover') {
      const layout = s.layout || 'standard';
      if (!COVER_LAYOUTS.includes(layout)) E(`${at}: layout must be one of: ${COVER_LAYOUTS.join(', ')}`);
      if (layout === 'quote' ? !s.statement : !s.headline) E(`${at}: ${layout === 'quote' ? 'statement' : 'headline'} required`);
      if (!s.figure && layout !== 'compare') W(`${at}: no figure — the hook should be one big number`);
      if (['poster', 'split'].includes(layout) && !s.figure?.value) E(`${at}: layout ${layout} needs figure.value`);
      if (layout === 'split') {
        if (s.tones && (!Array.isArray(s.tones) || s.tones.length !== 2 || s.tones.some((t) => !THEMES[t]) || s.tones[0] === s.tones[1])) E(`${at}: tones = two different themes, e.g. ["dark","lime"]`);
        if (s.split && !['rows', 'cols'].includes(s.split)) E(`${at}: split rows|cols`);
      }
    }
    if (s.type === 'compare' || (s.type === 'cover' && s.layout === 'compare')) {
      if ((s.items || []).length !== 2) E(`${at}: compare needs exactly 2 items`);
      (s.items || []).forEach((it, j) => (!it.label || it.value == null || it.value === '') && E(`${at}: items[${j}] needs label + value`));
      if ((s.items || []).filter((it) => it.highlight).length > 1) E(`${at}: highlight at most one compare item (one accent per slide)`);
    }
    if (s.type === 'map' || (s.type === 'cover' && s.layout === 'map')) {
      if (s.bbox != null && !(Array.isArray(s.bbox) && s.bbox.length === 4 && s.bbox.every(Number.isFinite) && s.bbox[0] < s.bbox[2] && s.bbox[1] < s.bbox[3])) E(`${at}: bbox = [west, south, east, north]`);
      if (s.bbox == null && s.region != null && !REGIONS[s.region]) E(`${at}: region must be one of: ${Object.keys(REGIONS).join(', ')}`);
      const n = (s.points || []).length;
      if (n < 2 || n > 60) E(`${at}: map needs 2–60 points`);
      (s.points || []).forEach((p, j) => {
        if (!p.label || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) E(`${at}: points[${j}] needs label + lat/lon`);
        if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < 0) E(`${at}: points[${j}] needs a numeric value ≥ 0`);
      });
    }
    if (s.type === 'quote' && !s.text) E(`${at}: text required`);
    if ((s.type === 'compare' || s.type === 'map') && !s.title) E(`${at}: title required`);
    if (s.type === 'stat' && !s.value) E(`${at}: value required`);
    if (s.type === 'list') {
      if (!s.title) E(`${at}: title required`);
      const n = (s.rows || []).length;
      if (n < 2 || n > 6) E(`${at}: 2–6 rows`);
      (s.rows || []).forEach((r, j) => (!r.label || !r.value) && E(`${at}: rows[${j}] needs label + value`));
    }
    if (s.type === 'chart') {
      if (!s.title) E(`${at}: title required`);
      const kind = s.kind || 'bar';
      if (!['bar', 'hbar', 'line'].includes(kind)) E(`${at}: kind bar|hbar|line`);
      const n = (s.data || []).length;
      const max = kind === 'line' ? 24 : 8;
      if (n < 2 || n > max) E(`${at}: ${kind} chart needs 2–${max} points`);
      (s.data || []).forEach((d, j) => {
        if (!d.label || typeof d.value !== 'number' || !Number.isFinite(d.value)) E(`${at}: data[${j}] needs label + numeric value`);
        if (kind !== 'line' && d.value < 0) E(`${at}: bar values must be ≥ 0`);
      });
    }
    for (const k of ['delta']) if (s[k] && !['up', 'down', 'flat'].includes(s[k].dir)) E(`${at}: delta.dir up|down|flat`);
    for (const r of s.rows || []) if (r.delta && !['up', 'down', 'flat'].includes(r.delta.dir)) E(`${at}: row delta.dir up|down|flat`);

    // numbers must come from cited facts
    if (s.type !== 'closing') {
      const corpus = [...refs.flatMap((r) => (refFacts[r] || []).flatMap((f) => numbersIn(f, { skipLetterPrefixed: false, stripDates: false }))), ...derivedNums];
      const isMap = s.type === 'map' || (s.type === 'cover' && s.layout === 'map');
      const shown = [
        ...slideTexts(s).flatMap((t) => numbersIn(t)),
        ...(s.type === 'chart' ? (s.data || []).map((d) => d.value) : []),
        // map bubble sizes are data too (lat/lon are positions, never printed)
        ...(isMap ? (s.points || []).map((p) => p.value) : []),
      ];
      const missing = [...new Set(shown.filter((v) => !corpus.some((c) => same(c, v))))];
      if (missing.length) E(`${at}: number(s) ${missing.join(', ')} not found in the facts of its refs (${refs.join(', ') || 'none'}) or in derived[] — no invented numbers`);
    } else if (slideTexts(s).some((t) => numbersIn(t).length)) {
      E(`${at}: closing slide must not carry figures`);
    }

    // glyphs
    for (const t of slideTexts(s)) {
      const bad = unsupportedChars(t, FONTS.sans);
      if (bad.length) E(`${at}: characters not in bundled fonts: ${bad.join(' ')}`);
    }
  });
  for (const id of ids) if (!used.has(id)) W(`source/data hook "${id}" is never cited on a slide`);

  // ── caption & hashtags ──
  const cap = String(def.caption || '');
  const lines = cap.split('\n');
  if (!cap) E('caption required');
  if (cap.length > 2200) E(`caption ${cap.length} chars > 2200 (Instagram limit)`);
  const words = cap.split(/\s+/).filter(Boolean).length;
  if (words < 40 || words > 220) E(`caption ${words} words — keep 60–150 (hard range 40–220)`);
  else if (words < 60 || words > 150) W(`caption ${words} words — target 60–150`);
  if (!/\d/.test(lines[0] || '')) E('caption: first line must lead with the hook number');
  if ((lines[0] || '').length > 125) E('caption: first line > 125 chars (cut off before "more")');
  if (/https?:\/\/|www\.|google\.com\/url/i.test(cap)) E('caption: no URLs (links are not clickable — write "link in bio")');
  const domains = cap.match(/\b[a-z0-9-]+\.(com|net|org|io|ai|co|tech|info)\b/gi) || [];
  const foreign = domains.filter((d) => d.toLowerCase() !== 'coloprice.com');
  if (foreign.length) E(`caption: no domains other than coloprice.com (${foreign.join(', ')})`);
  {
    const missing = missingNumbers(cap.replace(MENTION_RE, '$1'), factNumbers(def)); // digits inside @handles are not figures
    if (missing.length) E(`caption: number(s) ${missing.join(', ')} not found in any source/data-hook facts or derived[]`);
  }
  if (!/link in bio/i.test(cap)) E('caption: must say "link in bio"');
  if (!/^(data|sources?)\s*:/im.test(cap)) E('caption: needs a line starting with "Data:" or "Sources:"');
  if (/#\w/.test(cap)) E('caption: hashtags go in hashtags[], not in the caption text');
  // ── mentions & user tags (official accounts only) ──
  {
    const handles = loadHandles();
    const byIg = new Map(Object.entries(handles).filter(([, h]) => h.instagram).map(([name, h]) => [h.instagram.toLowerCase(), name]));
    const slideCorpus = slides.flatMap(slideTexts).join('\n').toLowerCase();
    const named = (name) => slideCorpus.includes(name.toLowerCase()) || slideCorpus.includes(name.toLowerCase().replace(/\s*\(.*\)$/, ''));
    const mentions = [...cap.matchAll(MENTION_RE)].map((m) => m[2].replace(/\.$/, '').toLowerCase()).filter((h) => h !== 'coloprice');
    if (mentions.length > MAX_MENTIONS) E(`caption: ${mentions.length} @mentions > ${MAX_MENTIONS}`);
    if (new Set(mentions).size !== mentions.length) E('caption: an @mention is repeated');
    for (const h of mentions) {
      const name = byIg.get(h);
      if (!name) E(`caption: @${h} is not an official account in config/handles.json — never guess handles`);
      else if (!named(name)) E(`caption: @${h} (${name}) is mentioned but ${name} does not appear on any slide`);
    }
    const tags = def.userTags ?? [];
    if (!Array.isArray(tags)) E('userTags: array of {username, slide?}');
    else {
      if (tags.length > MAX_USER_TAGS) E(`userTags: at most ${MAX_USER_TAGS}`);
      for (const t of tags) {
        const u = String(t?.username || '').toLowerCase();
        const name = byIg.get(u);
        if (!name) E(`userTags: "${t?.username}" is not an official account in config/handles.json`);
        else if (!named(name)) E(`userTags: ${name} does not appear on any slide`);
        if (t?.slide != null && (!Number.isInteger(t.slide) || t.slide < 1 || t.slide > slides.length)) E(`userTags: slide for ${t?.username} must be 1..${slides.length}`);
      }
    }
  }
  if (/coloprice\.com/i.test(cap)) {
    const recent = Object.values(state.published || {}).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 2);
    if (recent.some((p) => p.mentionsDomain)) E('caption: coloprice.com may appear at most once every 3 posts — one of the last 2 already had it; use "link in bio" only');
  }
  const tags = def.hashtags || [];
  if (tags.length < 3 || tags.length > 5) E(`hashtags: 3–5 (Instagram caps at 5), got ${tags.length}`);
  const seenTags = new Set();
  for (const t of tags) {
    if (!/^#[A-Za-z][A-Za-z0-9_]{1,40}$/.test(t)) E(`hashtag "${t}" invalid`);
    if (seenTags.has(t.toLowerCase())) E(`hashtag "${t}" duplicated`);
    seenTags.add(t.toLowerCase());
    if (BANNED_TAGS.includes(t.toLowerCase())) E(`hashtag "${t}" is a broad/spam tag — not allowed`);
  }

  // ── content safety ──
  const allText = [cap, ...slides.flatMap(slideTexts)].join('\n');
  safetyErrors(allText, env).forEach(E);

  // ── optional X (Twitter) overrides: x.text / x.slides / x.replyPath (see FORMAT.md) ──
  if (def.x != null) xPostErrors(def, { env }).forEach((m) => E(`x: ${m}`));

  // ── layout fit (same engine as the renderer) ──
  if (fit && !errors.some((e) => e.includes('unknown type'))) {
    const ctx = slideContext(def);
    slides.forEach((s, i) => {
      if (!SLIDE_TYPES.includes(s.type)) return;
      try {
        const { issues } = buildSlide(s, { ...ctx, index: i + 1 });
        issues.forEach((m) => E(`slide ${i + 1} (${s.type}) layout: ${m}`));
      } catch (e) {
        E(`slide ${i + 1} (${s.type}) layout crashed: ${e.message}`);
      }
    });
  }
  return { errors, warnings };
}

export async function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, 'utf8')) : { published: {}, skipped: {} };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  loadEnv();
  const args = parseArgs();
  const state = await loadState();
  const all = (await readdir(QUEUE_DIR)).filter((f) => f.endsWith('.json')).sort();
  const target = args._[0];
  const files = args.all || !target ? all : all.filter((f) => f.includes(target) || resolve(QUEUE_DIR, f) === resolve(target));
  if (!files.length) {
    console.error(`✗ no queue file matches "${target}"`);
    process.exit(2);
  }
  let bad = 0;
  // domain cadence across the queue order: published history + unpublished items in publish order
  const history = Object.values(state.published || {}).sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt))).map((p) => Boolean(p.mentionsDomain));
  const cadence = {};
  for (const f of all) {
    const d = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
    if (state.published?.[d.slug] || d.status !== 'ready') continue;
    const m = /coloprice\.com/i.test(d.caption || '');
    if (m && history.slice(-2).some(Boolean)) cadence[f] = 'coloprice.com in caption, but one of the 2 posts before it (in queue order) also has it — once every 3 posts';
    history.push(m);
  }
  for (const f of files) {
    const def = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
    if (args.all && state.published?.[def.slug]) {
      console.log(`· ${f} (published — skipped)`);
      continue;
    }
    // a published carousel is history: the domain-cadence check only applies to the unpublished ones
    const st = state.published?.[def.slug] ? { published: {} } : state;
    const { errors, warnings } = validateCarousel(def, { file: f, state: st });
    if (cadence[f]) errors.push(cadence[f]);
    warnings.forEach((w) => console.log(`  ! ${def.slug}: ${w}`));
    if (errors.length) {
      bad++;
      console.error(`✗ ${f}: ${errors.length} error(s)`);
      errors.forEach((e) => console.error('  - ' + e));
    } else console.log(`✓ ${f}`);
  }
  process.exit(bad ? 1 : 0);
}
