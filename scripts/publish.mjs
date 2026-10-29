// Publishes the next ready carousel to Instagram (Graph API, carousel flow):
//   1 container per slide (is_carousel_item) -> CAROUSEL container -> media_publish.
//
//   node scripts/publish.mjs --dry-run          # full check, prints URLs + caption, no API writes
//   node scripts/publish.mjs                    # publish next ready (status "ready", not expired)
//   node scripts/publish.mjs --slug=<slug>      # publish a specific one
//   node scripts/publish.mjs --wait             # poll slide URLs up to 10 min (fresh push)
//   node scripts/publish.mjs --no-notify        # skip Telegram
//
// Guards (all hard):
//   * max posts per Asia/Bangkok day from config/limits.json (default 1; dated launch burst 3/day, >=3h apart) — no override flag
//   * idempotency: slugs in state.published are never re-posted; before media_publish we also
//     look at the account's recent media for a post with the same first caption line (crash recovery)
//   * validate-carousel.mjs must pass; slides must exist in out/<slug>/ and be live at
//     SLIDES_BASE_URL as image/jpeg (Meta fetches them itself)
//
// Env (.env.local locally, GitHub Secrets/Variables in CI — never hardcoded):
//   IG_USER_ID, IG_ACCESS_TOKEN, SLIDES_BASE_URL,
//   optional: GRAPH_API_VERSION (v23.0), IG_GRAPH_HOST (graph.facebook.com | graph.instagram.com),
//             TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (comma-separated), CONTENT_DENYLIST
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUEUE_DIR, OUT_DIR, STATE_FILE, loadEnv, parseArgs, bangkokDate, slideFile } from './lib/env.mjs';
import { validateCarousel, loadState } from './validate-carousel.mjs';
import { notify as tg } from './lib/telegram.mjs';

loadEnv();
const args = parseArgs();
const DRY = Boolean(args['dry-run']);
const notify = args['no-notify'] || DRY ? async (m) => console.log(`  (telegram skipped) ${m}`) : tg;
const today = bangkokDate();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg, { alert } = {}) {
  console.error(`✗ ${msg}`);
  return (alert ? notify(alert) : Promise.resolve()).then(() => process.exit(1));
}
async function env(k) {
  const v = process.env[k];
  if (!v) await fail(`missing env ${k} — see SETUP.md`, { alert: `⚠️ Coloprice IG: не задан ${k} (секрет/переменная) — публикация невозможна` });
  return v;
}

// ── state + daily guard ──
const state = await loadState();
state.published ||= {};
state.skipped ||= {};
const saveState = () => writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
const limits = JSON.parse(await readFile(new URL('../config/limits.json', import.meta.url), 'utf8'));
const inBurst = Boolean(limits.burst?.until && today <= limits.burst.until);
const maxToday = inBurst ? limits.burst.perDay : limits.perDay;
const minGapMs = (inBurst ? limits.burst.minHoursBetween : 0) * 3600e3;
const todays = Object.entries(state.published).filter(([, p]) => p.bangkokDate === today);
const lastAt = Math.max(0, ...Object.values(state.published).map((p) => Date.parse(p.publishedAt) || 0));
let blocked = null;
if (todays.length >= maxToday) blocked = `already posted ${todays.length} today (${today}, Asia/Bangkok) — ${maxToday}/day max`;
else if (minGapMs && Date.now() - lastAt < minGapMs) blocked = `last post was ${((Date.now() - lastAt) / 3600e3).toFixed(1)}h ago — burst needs ${limits.burst.minHoursBetween}h between posts`;
if (blocked) {
  console.log(`✓ ${blocked}, nothing to do`);
  if (!DRY) process.exit(0);
  console.log('  (dry-run continues for preview only)');
}

// ── pick ──
const THURSDAY = new Date(`${today}T12:00:00Z`).getUTCDay() === 4 && !args.slug;
const files = (await readdir(QUEUE_DIR)).filter((f) => f.endsWith('.json')).sort();
let def = null;
let file = null;
for (const f of files) {
  const d = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
  if (args.slug) {
    if (d.slug === args.slug) (def = d), (file = f);
    if (def) break;
    continue;
  }
  if (state.published[d.slug] || d.status !== 'ready') continue;
  if (d.publishBy && d.publishBy < today) {
    if (!state.skipped[d.slug]) {
      state.skipped[d.slug] = { reason: `expired (publishBy ${d.publishBy})`, at: new Date().toISOString() };
      console.log(`  skip ${d.slug}: news expired (publishBy ${d.publishBy})`);
      if (!DRY) await saveState();
    }
    continue;
  }
  if (!def) (def = d), (file = f);
  // Thursday (Asia/Bangkok) is the fixed weekly slot of Coloprice Top: a ready one jumps the queue.
  if (THURSDAY && d.format === 'coloprice-top') { def = d; file = f; break; }
  if (!THURSDAY) break;
}
if (!def) {
  if (args.slug) await fail(`no queued carousel with slug "${args.slug}"`);
  console.log('✓ queue has nothing ready — the carousel-writer routine fills it');
  process.exit(0);
}
if (state.published[def.slug]) await fail(`"${def.slug}" was already published (${state.published[def.slug].permalink || state.published[def.slug].id}) — refusing to re-post`);

// ── validate (hard gate) ──
const { errors, warnings } = validateCarousel(def, { file, state });
warnings.forEach((w) => console.log(`  ! ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error('  - ' + e));
  await fail(`"${def.slug}" fails validation (${errors.length})`, { alert: `⚠️ Coloprice IG: карусель ${def.slug} не прошла валидацию (${errors.length} ошиб.) — публикация отменена` });
}

// ── slides: local + public ──
const n = def.slides.length;
for (let i = 0; i < n; i++) {
  if (!existsSync(resolve(OUT_DIR, def.slug, slideFile(i)))) await fail(`out/${def.slug}/${slideFile(i)} missing — run render-carousel.mjs and commit out/`);
}
const base = (await env('SLIDES_BASE_URL')).replace(/\/$/, '');
const urls = def.slides.map((_, i) => `${base}/${def.slug}/${slideFile(i)}`);
const caption = [def.caption, (def.hashtags || []).join(' ')].filter(Boolean).join('\n\n');

async function probe(u) {
  try {
    const r = await fetch(u, { method: 'HEAD', redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    const len = Number(r.headers.get('content-length') || 0);
    if (!r.ok) return `HTTP ${r.status}`;
    if (!/^image\/jpe?g/i.test(type)) return `content-type ${type || 'none'} (Instagram needs image/jpeg)`;
    if (len > 8 * 1024 * 1024) return `size ${len} > 8 MB`;
    return null;
  } catch (e) {
    return e.message;
  }
}
console.log(`→ ${def.slug} (${def.format}, ${n} slides)`);
const deadline = Date.now() + (args.wait ? 10 * 60_000 : 0);
for (const u of urls) {
  let problem;
  while ((problem = await probe(u))) {
    if (Date.now() >= deadline) await fail(`slide not publicly fetchable: ${u} — ${problem}. Push out/ and check SLIDES_BASE_URL (repo must be public).`, { alert: `⚠️ Coloprice IG: слайды ${def.slug} недоступны по SLIDES_BASE_URL (${problem}) — публикация отменена` });
    console.log(`  … waiting: ${u} (${problem})`);
    await sleep(20_000);
  }
}
console.log('✓ all slide URLs live (image/jpeg)');

if (DRY) {
  console.log('\n— DRY RUN — nothing sent to Instagram');
  console.log('Slides:\n  ' + urls.join('\n  '));
  console.log(`\nCaption (${caption.length} chars):\n${caption}`);
  if ((def.userTags || []).length) console.log(`User tags: ${def.userTags.map((t) => `@${t.username} (slide ${t.slide ?? 1})`).join(', ')}`);
  process.exit(0);
}

// ── Graph API ──
const VERSION = process.env.GRAPH_API_VERSION || 'v23.0';
const HOST = process.env.IG_GRAPH_HOST || 'graph.facebook.com';
const GRAPH = `https://${HOST}/${VERSION}`;
const igUser = await env('IG_USER_ID');
const token = await env('IG_ACCESS_TOKEN');

class GraphError extends Error {}
async function api(path, { method = 'GET', params = {} } = {}) {
  const u = new URL(`${GRAPH}/${path}`);
  const all = { ...params, access_token: token };
  let res;
  if (method === 'GET') {
    for (const [k, v] of Object.entries(all)) u.searchParams.set(k, v);
    res = await fetch(u);
  } else {
    res = await fetch(u, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(all) });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new GraphError(`${method} /${path}: ${e.message || res.status} (code ${e.code ?? '?'}${e.error_subcode ? `/${e.error_subcode}` : ''})`);
    err.code = e.code;
    throw err;
  }
  return json;
}
async function waitContainer(id) {
  for (let i = 0; i < 40; i++) {
    const j = await api(id, { params: { fields: 'status_code,status' } });
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw new GraphError(`container ${id}: ${j.status_code} ${j.status || ''}`);
    await sleep(5000);
  }
  throw new GraphError(`container ${id} not ready after 200s`);
}
const firstLine = (s) => String(s || '').split('\n')[0].trim();

async function findExisting() {
  // crash recovery: same first caption line posted in the last 36h => already published
  const j = await api(`${igUser}/media`, { params: { fields: 'id,caption,permalink,timestamp', limit: '10' } }).catch(() => ({ data: [] }));
  return (j.data || []).find((m) => firstLine(m.caption) === firstLine(caption) && Date.now() - Date.parse(m.timestamp) < 36 * 3600_000);
}

function record(id, permalink) {
  state.published[def.slug] = {
    id,
    permalink: permalink || null,
    format: def.format,
    topic: def.topic,
    publishedAt: new Date().toISOString(),
    bangkokDate: today,
    mentionsDomain: /coloprice\.com/i.test(def.caption),
  };
  return saveState();
}

try {
  const existing = await findExisting();
  if (existing) {
    await record(existing.id, existing.permalink);
    console.log(`✓ already on Instagram (${existing.permalink}) — state repaired, not re-posting`);
    process.exit(0);
  }
  // Optional quota check (Instagram allows ~50 API posts / 24h; we use 1)
  const quota = await api(`${igUser}/content_publishing_limit`, { params: { fields: 'quota_usage,config' } }).catch(() => null);
  if (quota?.data?.[0]) console.log(`  quota: ${quota.data[0].quota_usage}/${quota.data[0].config?.quota_total ?? '?'} in 24h`);

  // userTags (official accounts from config/handles.json, checked by the validator): tags on carousel images,
  // spread along the bottom of the slide. If Instagram refuses a tag (account not taggable), the slide is
  // posted without tags rather than failing the post.
  const tagsBySlide = new Map();
  for (const t of def.userTags || []) {
    const i = (t.slide ?? 1) - 1;
    tagsBySlide.set(i, [...(tagsBySlide.get(i) || []), t.username]);
  }
  const children = [];
  for (const [i, u] of urls.entries()) {
    const names = tagsBySlide.get(i) || [];
    const params = { image_url: u, is_carousel_item: 'true' };
    if (names.length) params.user_tags = JSON.stringify(names.map((username, k) => ({ username, x: +((k + 1) / (names.length + 1)).toFixed(2), y: 0.9 })));
    let j;
    try {
      j = await api(`${igUser}/media`, { method: 'POST', params });
    } catch (err) {
      if (!params.user_tags) throw err;
      console.log(`  ! user tags refused on slide ${i + 1} (${err.message}) — posting it without tags`);
      delete params.user_tags;
      j = await api(`${igUser}/media`, { method: 'POST', params });
    }
    children.push(j.id);
    console.log(`  child ${children.length}/${urls.length}: ${j.id}${names.length && params.user_tags ? ` (tags: ${names.join(', ')})` : ''}`);
  }
  for (const c of children) await waitContainer(c);
  const container = await api(`${igUser}/media`, { method: 'POST', params: { media_type: 'CAROUSEL', children: children.join(','), caption } });
  await waitContainer(container.id);
  const pub = await api(`${igUser}/media_publish`, { method: 'POST', params: { creation_id: container.id } });
  await record(pub.id, null); // write state immediately: idempotency first, permalink second
  const info = await api(pub.id, { params: { fields: 'permalink' } }).catch(() => ({}));
  if (info.permalink) await record(pub.id, info.permalink);
  console.log(`✓ published: ${info.permalink || pub.id}`);
  console.log(`  state → content/state.json (commit it: "social: published ${def.slug}")`);
  await notify(`📸 Coloprice IG: опубликована карусель «${def.topic}» — ${info.permalink || pub.id}`);
} catch (e) {
  let alert = `⚠️ Coloprice IG: ошибка публикации ${def.slug}: ${e.message}`;
  if (e.code === 190) alert = '⚠️ Coloprice IG: IG_ACCESS_TOKEN недействителен (code 190 — истёк или отозван). Выпустить новый токен System User и обновить секрет: gh secret set IG_ACCESS_TOKEN -R tdvchina/coloprice-social';
  else if (e.code === 200 || e.code === 10) alert = `⛔ Coloprice IG: Meta отказала в доступе (code ${e.code}) — проверить права токена/кабинет developers.facebook.com`;
  else if (e.code === 9 || e.code === 4 || e.code === 32) alert = `⏳ Coloprice IG: лимит Graph API (code ${e.code}) — повтор завтра`;
  await fail(e.message, { alert });
}
