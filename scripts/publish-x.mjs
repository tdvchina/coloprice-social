// Cross-posts carousels to X (Twitter): the next carousel that is already on Instagram
// (content/state.json → published) but not yet on X (→ x).
//
//   node scripts/publish-x.mjs --dry-run              # exact text, images, alt texts and reply; no keys needed
//   node scripts/publish-x.mjs --dry-run --slug=<s>   # preview any queued carousel (even if not on Instagram yet)
//   node scripts/publish-x.mjs                        # post (1 per run)
//   node scripts/publish-x.mjs --no-notify            # skip Telegram
//
// Post = text ≤ 280 weighted chars (no URL: links cut reach and are billed ~13x) + up to 4 images
// with alt text; then ONE reply "Full table + sources: coloprice.com/<page>". See scripts/lib/xpost.mjs.
//
// Guards (all hard): config/limits.json → x.perDay per Asia/Bangkok day, x.minHoursBetween,
// x.maxAgeDays; 1 post per run; idempotency via state.x[slug] (state is written right after the
// main post, before the reply); X's own duplicate-content refusal is treated as "already posted";
// the same number/safety/denylist rules as Instagram (scripts/lib/rules.mjs).
//
// API (docs.x.com, checked 28.10.2026): OAuth 1.0a user context (scripts/lib/oauth1.mjs);
//   media: POST /2/media/upload/initialize → /2/media/upload/{id}/append → /{id}/finalize
//          (→ GET /2/media/upload?command=STATUS if processing_info), alt text POST /2/media/metadata
//   post:  POST /2/tweets {text, media:{media_ids}} / {text, reply:{in_reply_to_tweet_id}}
//
// Env (.env/.env.local locally, GitHub Secrets in CI — never printed):
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
//   optional: X_HANDLE (for nicer post URLs), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CONTENT_DENYLIST
import { readFile, readdir, writeFile, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUEUE_DIR, OUT_DIR, STATE_FILE, loadEnv, parseArgs, bangkokDate, slideFile } from './lib/env.mjs';
import { loadState } from './validate-carousel.mjs';
import { notify as tg } from './lib/telegram.mjs';
import { oauthHeader } from './lib/oauth1.mjs';
import { buildXPost, xPostErrors, tweetLength } from './lib/xpost.mjs';

loadEnv();
const args = parseArgs();
const DRY = Boolean(args['dry-run']);
const API = process.env.X_API_BASE || 'https://api.x.com'; // override only for local mock tests
const IMAGE_MAX = 5 * 1024 * 1024; // tweet_image limit (docs.x.com media introduction)
const today = bangkokDate();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Telegram: real messages only on live runs. In Actions a marker tells the workflow's
// generic failure step that a precise alert was already sent.
async function notify(msg) {
  if (DRY || args['no-notify']) return console.log(`  (telegram skipped) ${msg}`);
  await tg(msg);
  if (process.env.RUNNER_TEMP) await writeFile(resolve(process.env.RUNNER_TEMP, 'x-notified'), '1').catch(() => {});
}
async function output(k, v) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
}
async function fail(msg, alert) {
  console.error(`✗ ${msg}`);
  if (alert) await notify(alert);
  process.exit(1);
}

// ── config, state, queue ──
const limitsAll = JSON.parse(await readFile(new URL('../config/limits.json', import.meta.url), 'utf8'));
const L = { perDay: 2, minHoursBetween: 4, maxAgeDays: 10, reply: true, ...(limitsAll.x || {}) };
const state = await loadState();
state.published ||= {};
state.x ||= {};
const saveState = async () => {
  // re-read right before writing: never clobber what another writer (the Instagram run) added
  const fresh = await loadState();
  fresh.x = { ...(fresh.x || {}), ...state.x };
  await writeFile(STATE_FILE, JSON.stringify(fresh, null, 2) + '\n');
};
const queue = {};
for (const f of (await readdir(QUEUE_DIR)).filter((n) => n.endsWith('.json')).sort()) {
  const d = JSON.parse(await readFile(resolve(QUEUE_DIR, f), 'utf8'));
  queue[d.slug] = { def: d, file: f };
}
const slidePath = (slug, n) => resolve(OUT_DIR, slug, slideFile(n - 1));
const postUrl = (id) => `https://x.com/${process.env.X_HANDLE?.replace(/^@/, '') || 'i'}/status/${id}`;

// ── X API client (OAuth 1.0a user context) ──
class XError extends Error {}
let creds = null;
function needCreds() {
  const keys = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) return missing;
  creds = { consumerKey: process.env.X_API_KEY, consumerSecret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
  return null;
}
async function x(method, path, { json, form, query, retries = 0 } = {}) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const headers = { Authorization: oauthHeader({ method, url: url.href, creds }) };
  let body;
  if (json) (headers['Content-Type'] = 'application/json'), (body = JSON.stringify(json));
  else if (form) body = form; // FormData: multipart, boundary set by fetch; not part of the signature
  let res;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (e) {
    if (retries > 0) return sleep(3000).then(() => x(method, path, { json, form, query, retries: retries - 1 }));
    throw new XError(`${method} ${url.pathname}: network error ${e.message}`);
  }
  const text = await res.text();
  let j = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    j = { detail: text.slice(0, 200) };
  }
  if (res.status >= 500 && retries > 0) {
    await sleep(3000);
    return x(method, path, { json, form, query, retries: retries - 1 });
  }
  if (!res.ok || (j.errors?.length && !j.data)) {
    const first = j.errors?.[0] || {};
    const detail = j.detail || first.detail || first.message || j.title || j.error || `HTTP ${res.status}`;
    const err = new XError(`${method} ${url.pathname}: ${res.status} ${detail}`);
    Object.assign(err, { status: res.status, detail: String(detail), type: j.type || first.type || '', reset: Number(res.headers.get('x-rate-limit-reset')) || 0 });
    throw err;
  }
  return j;
}
const isDuplicate = (e) => /duplicate/i.test(`${e.detail} ${e.message}`);

async function uploadImage(file, alt) {
  const buf = await readFile(file);
  // chunked flow (recommended by docs.x.com for all media); a slide is ~0.1 MB → one APPEND
  const init = await x('POST', '/2/media/upload/initialize', { json: { media_type: 'image/jpeg', total_bytes: buf.length, media_category: 'tweet_image' }, retries: 2 });
  const id = init.data?.id;
  if (!id) throw new XError(`media initialize returned no id`);
  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < buf.length; i += CHUNK, seg++) {
    const fd = new FormData();
    fd.append('segment_index', String(seg));
    fd.append('media', new Blob([buf.subarray(i, i + CHUNK)], { type: 'image/jpeg' }), 'slide.jpg');
    await x('POST', `/2/media/upload/${id}/append`, { form: fd, retries: 2 });
  }
  let fin = await x('POST', `/2/media/upload/${id}/finalize`, { retries: 2 });
  for (let i = 0; i < 20 && fin.data?.processing_info && !['succeeded', 'failed'].includes(fin.data.processing_info.state); i++) {
    await sleep(Math.max(1, fin.data.processing_info.check_after_secs || 2) * 1000);
    fin = await x('GET', '/2/media/upload', { query: { command: 'STATUS', media_id: id }, retries: 2 });
  }
  if (fin.data?.processing_info?.state === 'failed') throw new XError(`media ${id} processing failed`);
  if (alt) await x('POST', '/2/media/metadata', { json: { id, metadata: { alt_text: { text: alt } } }, retries: 2 });
  return id;
}

/** After a duplicate refusal: find our own recent post with the same first line (owned read, ~$0.001/post). */
async function findRecent(text) {
  try {
    const me = await x('GET', '/2/users/me');
    const j = await x('GET', `/2/users/${me.data.id}/tweets`, { query: { max_results: '5', 'tweet.fields': 'created_at' } });
    const first = text.split('\n')[0].trim();
    return (j.data || []).find((t) => String(t.text).startsWith(first)) || null;
  } catch {
    return null;
  }
}

function alertFor(e, slug) {
  const s = e.status;
  const d = `${e.detail || e.message}`;
  if (s === 401) return '⛔ Coloprice X: 401 — ключи X не приняты (X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET неверны, перевыпущены или отозваны). Перевыпустить в console.x.com и обновить секреты: scripts/push-secrets.sh';
  if (s === 402 || /credit|payment required|spend/i.test(d)) return '💳 Coloprice X: X API отказал по оплате — кончились кредиты pay-per-use или достигнут лимит трат. Пополнить в console.x.com → Billing';
  if (s === 403 && /oauth1-permissions|permission|read-only|read only|not configured with the appropriate/i.test(`${e.type} ${d}`))
    return '⛔ Coloprice X: 403 — у приложения нет права записи. console.x.com → приложение → User authentication settings → App permissions «Read and write», ЗАТЕМ перевыпустить Access Token/Secret (старые остаются read-only) и обновить секреты';
  if (s === 403 && /client-not-enrolled|project/i.test(`${e.type} ${d}`)) return '⛔ Coloprice X: 403 — приложение не привязано к проекту/плану X API (client-not-enrolled). Проверить в console.x.com';
  if (s === 403) return `⛔ Coloprice X: 403 при публикации ${slug}: ${d.slice(0, 200)}`;
  if (s === 429) {
    const when = e.reset ? new Date(e.reset * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'позже';
    return `⏳ Coloprice X: лимит запросов (429) — ${slug} не опубликован, повтор при следующем запуске (сброс лимита: ${when})`;
  }
  return `⚠️ Coloprice X: ошибка публикации ${slug}: ${d.slice(0, 300)}`;
}

// ── 1. a main post whose reply did not go out yet → finish it first (this run's one action) ──
const pending = !DRY && !args.slug && L.reply ? Object.entries(state.x).find(([, p]) => p.id && p.replyPending && Date.now() - Date.parse(p.postedAt) < 48 * 3600e3) : null;

// ── 2. pick the next carousel ──
function eligibility(slug) {
  const q = queue[slug];
  if (!q) return 'not in content/queue';
  if (q.def.x?.skip) return 'x.skip in queue JSON';
  if (q.def.publishBy && q.def.publishBy < today) return `news expired (publishBy ${q.def.publishBy})`;
  const n = buildXPost(q.def).slides;
  const missing = n.filter((i) => !existsSync(slidePath(slug, i)));
  if (missing.length) return `slides ${missing.join(', ')} missing in out/${slug}/ (pruned or not rendered)`;
  return null;
}
let def = null;
const skips = [];
if (args.slug) {
  def = queue[args.slug]?.def;
  if (!def) await fail(`no queued carousel with slug "${args.slug}"`);
  if (!DRY && !state.published[args.slug]) await fail(`"${args.slug}" is not on Instagram yet — X only cross-posts published carousels`);
  if (!DRY && state.x[args.slug]?.id) await fail(`"${args.slug}" is already on X (${state.x[args.slug].url}) — refusing to re-post`);
} else if (!pending) {
  const candidates = Object.entries(state.published)
    .filter(([slug]) => !state.x[slug])
    .sort((a, b) => String(a[1].publishedAt).localeCompare(String(b[1].publishedAt)));
  for (const [slug, p] of candidates) {
    const age = (Date.now() - Date.parse(p.publishedAt)) / 86400e3;
    if (age > L.maxAgeDays) {
      skips.push([slug, `on Instagram ${age.toFixed(0)} days ago > x.maxAgeDays ${L.maxAgeDays}`]);
      continue;
    }
    const why = eligibility(slug);
    if (why) {
      skips.push([slug, why]);
      continue;
    }
    def = queue[slug].def;
    break;
  }
}
for (const [slug, reason] of skips) {
  console.log(`  skip ${slug}: ${reason}`);
  if (!DRY) state.x[slug] = { skipped: reason, at: new Date().toISOString() };
}

// ── 3. daily cap + min gap (main posts only) ──
const posts = Object.values(state.x).filter((p) => p.id && p.postedAt);
const todays = posts.filter((p) => p.bangkokDate === today).length;
const lastAt = Math.max(0, ...posts.map((p) => Date.parse(p.postedAt) || 0));
let blocked = null;
if (todays >= L.perDay) blocked = `already ${todays} X post(s) today (${today}, Asia/Bangkok) — x.perDay ${L.perDay}`;
else if (L.minHoursBetween && Date.now() - lastAt < L.minHoursBetween * 3600e3) blocked = `last X post ${((Date.now() - lastAt) / 3600e3).toFixed(1)}h ago — x.minHoursBetween ${L.minHoursBetween}`;

if (!def && !pending) {
  if (skips.length && !DRY) {
    await saveState();
    await output('action', 'skipped');
    await output('slug', skips[skips.length - 1][0]);
  }
  console.log('✓ nothing to cross-post: every carousel published on Instagram is already on X (or skipped)');
  process.exit(0);
}

// ── 4. build + check the post ──
let post = null;
if (def) {
  post = buildXPost(def);
  const errors = xPostErrors(def, { post });
  for (const n of post.slides) {
    const f = slidePath(def.slug, n);
    if (!existsSync(f)) errors.push(`out/${def.slug}/${slideFile(n - 1)} missing — render and commit out/`);
    else if ((await stat(f)).size > IMAGE_MAX) errors.push(`out/${def.slug}/${slideFile(n - 1)} > 5 MB (X image limit)`);
  }
  console.log(`→ ${def.slug} (${def.format}) → X`);
  if (errors.length) {
    errors.forEach((e) => console.error('  - ' + e));
    await fail(`"${def.slug}" fails the X checks (${errors.length})`, `⚠️ Coloprice X: пост ${def.slug} не прошёл проверки (${errors.length}) — не опубликован. Подробности в логе Actions`);
  }
  console.log(`\nPost (${tweetLength(post.text)}/280 weighted chars, no URL):\n${post.text}\n`);
  console.log(`Images (${post.slides.length}):`);
  post.slides.forEach((n, i) => console.log(`  ${slideFile(n - 1)}  out/${def.slug}/${slideFile(n - 1)}\n     alt (${post.alts[i].length}): ${post.alts[i]}`));
  console.log(L.reply ? `\nReply (${tweetLength(post.reply)}/280):\n${post.reply}` : '\nReply: off (config/limits.json x.reply = false)');
  const cost = 0.015 + post.slides.length * 0.005 + (L.reply ? 0.2 : 0);
  console.log(`\nEstimated X API cost ≈ $${cost.toFixed(3)} (post $0.015 + alt text ${post.slides.length}×$0.005${L.reply ? ' + reply with URL $0.20' : ''}; docs.x.com pricing as of Oct 2026)`);
}
if (blocked && !pending) {
  console.log(`\n✓ ${blocked}, nothing to do`);
  if (!DRY) {
    if (skips.length) await saveState();
    process.exit(0);
  }
  console.log('  (dry-run continues for preview only)');
}
if (DRY) {
  console.log('\n— DRY RUN — nothing sent to X');
  process.exit(0);
}

// ── 5. live ──
const missing = needCreds();
if (missing) await fail(`missing env ${missing.join(', ')} — see SETUP.md «X (Twitter)»`, `⚠️ Coloprice X: не заданы секреты ${missing.join(', ')} — публикация в X невозможна (SETUP.md → «X (Twitter)»)`);

async function sendReply(slug, rec, text) {
  try {
    const r = await x('POST', '/2/tweets', { json: { text, reply: { in_reply_to_tweet_id: rec.id } } });
    Object.assign(rec, { replyId: r.data.id, replyUrl: postUrl(r.data.id) });
  } catch (e) {
    if (!isDuplicate(e)) throw e;
    rec.replyDuplicate = true;
  }
  delete rec.replyPending;
  state.x[slug] = rec;
  await saveState();
}

if (pending) {
  const [slug, rec] = pending;
  const d = queue[slug]?.def;
  console.log(`→ ${slug}: main post is on X (${rec.url}), the reply is not — posting the reply`);
  try {
    await sendReply(slug, rec, d ? buildXPost(d).reply : 'Full table + sources: coloprice.com');
    await output('action', 'reply');
    await output('slug', slug);
    console.log(`✓ reply posted: ${rec.replyUrl || '(duplicate — already there)'}`);
    await notify(`🐦 Coloprice X: допостили ссылку-ответ к посту ${slug} — ${rec.replyUrl || rec.url}`);
  } catch (e) {
    await fail(e.message, alertFor(e, slug));
  }
  process.exit(0);
}

const slug = def.slug;
let rec = null;
try {
  const mediaIds = [];
  for (const [i, n] of post.slides.entries()) {
    mediaIds.push(await uploadImage(slidePath(slug, n), post.alts[i]));
    console.log(`  media ${i + 1}/${post.slides.length}: ${mediaIds[i]}`);
  }
  let id = null;
  let duplicate = false;
  try {
    const r = await x('POST', '/2/tweets', { json: { text: post.text, media: { media_ids: mediaIds } } });
    id = r.data.id;
  } catch (e) {
    if (!isDuplicate(e)) throw e;
    duplicate = true;
    id = (await findRecent(post.text))?.id || null;
  }
  rec = {
    id,
    url: id ? postUrl(id) : null,
    postedAt: new Date().toISOString(),
    bangkokDate: today,
    slides: post.slides,
    ...(duplicate ? { duplicate: true } : {}),
    ...(L.reply && id ? { replyPending: true } : {}),
  };
  state.x[slug] = rec;
  await saveState(); // idempotency first: the main post is recorded before the reply is attempted
  await output('slug', slug);
  await output('action', duplicate ? 'duplicate' : 'posted');
  if (duplicate && !id) {
    console.log('✓ X refused it as duplicate content — it is already on the account; state repaired, no reply (post id unknown)');
    await notify(`ℹ️ Coloprice X: пост ${slug} уже есть в X (X отклонил дубль) — состояние исправлено, ссылку-ответ проверить вручную`);
    process.exit(0);
  }
  console.log(`✓ posted: ${rec.url}${duplicate ? ' (was already there — found by text)' : ''}`);
  if (L.reply) {
    try {
      await sendReply(slug, rec, post.reply);
      console.log(`✓ reply: ${rec.replyUrl || '(duplicate — already there)'}`);
    } catch (e) {
      console.error(`  ! reply failed: ${e.message} — the next run posts it`);
      await notify(`🐦 Coloprice X: опубликован пост «${def.topic}» — ${rec.url}\n⚠️ ссылка-ответ не ушла (${(e.detail || e.message).slice(0, 120)}) — следующий запуск допостит`);
      process.exit(0);
    }
  }
  console.log(`  state → content/state.json (commit it: "social: x posted ${slug}")`);
  await notify(`🐦 Coloprice X: опубликован пост «${def.topic}» — ${rec.url}`);
} catch (e) {
  await fail(e.message, alertFor(e, slug));
}
