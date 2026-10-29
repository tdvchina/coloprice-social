// X (Twitter) post derivation for a carousel — pure functions, no network, no fs.
// publish-x.mjs posts what buildXPost() returns; the validator and tests check it with xPostErrors().
//
// Post anatomy (X penalises links in the main post, and Post: Create with a URL costs ~13x more):
//   main post  = hook line (caption line 1) + one supporting fact (a caption sentence with a number)
//                + "Data: <datasets/publishers>" — ≤ 280 weighted chars, NO URL, up to 4 images
//   one reply  = "Full table + sources: coloprice.com/<page>"
// Queue JSON may override: x.text, x.slides (1-based, as out/<slug>/NN.jpg), x.replyPath, x.skip.
import { stripMarks, formatValue } from './slides.mjs';
import { factNumbers, missingNumbers, numbersIn, same, safetyErrors } from './rules.mjs';

export const X_MAX = 280;
export const ALT_MAX = 1000;
export const SITE = 'https://coloprice.com';

// ── weighted length (twitter-text v3: these ranges weigh 1, everything else 2; URLs = 23) ──
const LIGHT = [[0x0000, 0x10ff], [0x2000, 0x200d], [0x2010, 0x201f], [0x2032, 0x2037]];
// Conservative: anything shaped like name.tld counts as a link. X auto-links bare domains with any
// valid TLD, and there are ~1,500 of them (.media, .news, .cloud…) — "W.Media" IS a link on X.
const DOMAINISH = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?![a-z0-9])(?:\/[^\s]*)?/gi;
const URLISH = new RegExp(`https?:\\/\\/\\S+|${DOMAINISH.source}`, 'gi');
export function tweetLength(text) {
  let n = 0;
  const rest = String(text ?? '').normalize('NFC').replace(URLISH, () => ((n += 23), ''));
  for (const ch of rest) {
    const cp = ch.codePointAt(0);
    n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return n;
}

/** URL or bare domain in text (X auto-links bare domains too). */
export const hasLink = (t) => /https?:\/\/|www\./i.test(t) || new RegExp(DOMAINISH.source, 'i').test(t);
/** Publisher names that are domains ("W.Media") would become links on X: "W Media". */
export const unlink = (name) => String(name).replace(new RegExp(DOMAINISH.source, 'gi'), (m) => m.replace(/\./g, ' '));

// ── reply link: the human page behind a data hook ──
const DATA_PAGES = {
  '/data/data-center-pipeline.csv': '/pipeline/',
  '/data/colocation-price-index.json': '/index/',
  '/api/history/colo-index.json': '/history/',
  '/data/gpu-price-index.json': '/gpu/',
  '/api/history/gpu-prices.json': '/gpu/',
  '/data/transactions.csv': '/transactions/',
  '/data/data-center-incidents.csv': '/incidents/',
  '/data/capacity-watch.json': '/capacity-watch/',
};
function pageFor(u) {
  let url;
  try {
    url = new URL(u, SITE);
  } catch {
    return null;
  }
  if (!/^(www\.)?coloprice\.com$/i.test(url.hostname)) return null;
  if (DATA_PAGES[url.pathname]) return SITE + DATA_PAGES[url.pathname];
  if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null; // some other raw file: not a page
  return SITE + url.pathname;
}
/** x.replyPath → first data hook with a human page → coloprice.com/... on the closing slide → home. */
export function replyUrl(def) {
  if (def.x?.replyPath) return pageFor(def.x.replyPath) || `${SITE}/`;
  for (const h of def.dataHooks || []) {
    const p = pageFor(h.url);
    if (p) return p;
  }
  const closing = (def.slides || []).find((s) => s.type === 'closing');
  const m = `${closing?.text || ''} ${closing?.cta || ''}`.match(/coloprice\.com(\/[^\s,)]*)?/i);
  if (m) return pageFor(`${SITE}${m[1] || '/'}`.replace(/[.]+$/, '')) || `${SITE}/`;
  return `${SITE}/`;
}
export const displayUrl = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/^coloprice\.com\/$/, 'coloprice.com');
export const replyText = (def) => `Full table + sources: ${displayUrl(replyUrl(def))}`;

// ── text ──
const lines = (cap) => String(cap || '').split('\n').map((l) => l.trim());
const isMeta = (l) => /^(data|sources?|featured)\s*:/i.test(l) || /link in bio/i.test(l) || /\?\s*$/.test(l) || /#\w/.test(l) || /(^|\s)@[A-Za-z0-9_]/.test(l);
const sentences = (para) => para.split(/(?<=[.!;])\s+(?=[A-Z0-9“"'(])/).map((x) => x.trim()).filter(Boolean);

/** Caption sentences that carry a number (supporting-fact candidates), in caption order. */
export function factCandidates(def) {
  const [hook, ...rest] = lines(def.caption);
  const hookNums = numbersIn(hook);
  const out = [];
  for (const l of rest) {
    if (!l || isMeta(l)) continue;
    for (const s of sentences(l)) {
      const nums = numbersIn(s);
      if (!nums.length || s === hook) continue;
      if (nums.every((v) => hookNums.some((h) => same(h, v)))) continue; // repeats the hook
      out.push(s.replace(/;$/, '.'));
    }
  }
  // fallback: stat slides, "label: value (unit)."
  for (const s of def.slides || []) {
    if (s.type !== 'stat' || !numbersIn(stripMarks(s.value)).length) continue;
    out.push(`${stripMarks(s.label)}: ${stripMarks(s.value)}${s.unit ? ` (${stripMarks(s.unit)})` : ''}.`);
  }
  return [...new Set(out)];
}

/** "Data: Coloprice pipeline tracker, W.Media, DCD" — datasets first, then news publishers. */
export function dataLine(def, budget = X_MAX) {
  const names = [...new Set([...(def.dataHooks || []).map((d) => d.dataset), ...(def.sources || []).map((s) => s.publisher)].filter(Boolean).map(unlink))];
  for (let n = names.length; n >= 1; n--) {
    const more = names.length - n;
    const line = `Data: ${names.slice(0, n).join(', ')}${more ? ` +${more} more` : ''}`;
    if (tweetLength(line) <= budget) return line;
  }
  return names.length ? `Data: ${names[0]}` : '';
}

export function deriveText(def) {
  const hook = lines(def.caption)[0] || '';
  const data = dataLine(def, 80);
  const join = (...parts) => parts.filter(Boolean).join('\n\n');
  for (const fact of factCandidates(def)) {
    const t = join(hook, fact, data);
    if (tweetLength(t) <= X_MAX) return t;
  }
  return join(hook, data);
}

// ── images ──
const SCORE = { chart: 5, map: 5, compare: 4, list: 4, stat: 3, quote: 1 };
/** Cover + the 3 most informative inner slides (charts/maps > compare/list > key stat > secondary stat), in carousel order. 1-based. */
export function pickSlides(def) {
  if (Array.isArray(def.x?.slides)) return def.x.slides.slice();
  const slides = def.slides || [];
  const inner = slides
    .map((s, i) => ({ i, score: (SCORE[s.type] || 0) + (s.type === 'stat' && s.accent !== false ? 1 : 0) }))
    .filter(({ i, score }) => i > 0 && i < slides.length - 1 && score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .map(({ i }) => i + 1);
  return [1, ...inner.sort((a, b) => a - b)];
}

// ── alt text: headline + figure (+ the data for charts/lists/maps) ──
const clip = (t, n = ALT_MAX) => {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
};
const parts = (...p) =>
  p
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => stripMarks(String(x)).trim().replace(/[.:]$/, ''))
    .map((x) => (/[?!]$/.test(x) ? x : x + '.'))
    .join(' ');
const itemsText = (items = []) => items.map((it) => `${it.label}: ${it.value}${it.note ? ` (${it.note})` : ''}`).join(' vs ');
const pointsText = (s) => [...(s.points || [])].sort((a, b) => b.value - a.value).slice(0, 8).map((p) => `${p.label} ${p.valueLabel || formatValue(p.value, s.valueFormat)}`).join('; ');

export function altText(s) {
  const u = s.unit ? ` (${s.unit})` : '';
  switch (s.type) {
    case 'cover': {
      const head = s.headline || s.statement;
      const fig = s.figure ? `${s.figure.value}${s.figure.label ? ` — ${s.figure.label}` : ''}` : null;
      const extra = s.layout === 'compare' ? itemsText(s.items) : s.layout === 'map' ? pointsText(s) : null;
      return clip(parts(s.kicker, head, fig, extra, s.deck));
    }
    case 'stat':
      return clip(parts(`${s.label}: ${s.value}${s.unit ? ` — ${s.unit}` : ''}`, s.delta?.value ? `Change: ${s.delta.value}` : null, s.context));
    case 'chart': {
      const kind = s.kind === 'line' ? 'Line chart' : 'Bar chart';
      const pts = (s.data || []).map((d) => `${d.label} ${formatValue(d.value, s.valueFormat)}`).join('; ');
      return clip(parts(`${kind}: ${s.title}${u}`, pts, s.caption));
    }
    case 'list':
      return clip(parts(`${s.title}${u}`, (s.rows || []).map((r) => `${r.label} ${r.value}${r.note ? ` (${r.note})` : ''}`).join('; '), s.footnote));
    case 'compare':
      return clip(parts(`${s.title}${u}`, itemsText(s.items), s.verdict ? `${s.verdict.value} ${s.verdict.text || ''}` : null, s.caption));
    case 'map':
      return clip(parts(`Map: ${s.title}${u}`, pointsText(s), s.caption));
    case 'quote':
      return clip(parts(s.label, s.text, s.attribution));
    case 'photo':
      return clip(parts(s.headline, s.caption));
    case 'closing':
      return clip(parts(s.text, s.cta));
    default:
      return clip(parts(s.title || s.label || 'Coloprice chart'));
  }
}

/** Everything publish-x.mjs needs. slides are 1-based slide numbers. */
export function buildXPost(def) {
  const slides = pickSlides(def);
  return {
    text: typeof def.x?.text === 'string' ? def.x.text.trim() : deriveText(def),
    slides,
    alts: slides.map((n) => (def.slides?.[n - 1] ? altText(def.slides[n - 1]) : '')),
    reply: replyText(def),
    replyUrl: replyUrl(def),
  };
}

/** Hard rules for the X post (same "no invented numbers" + safety rules as Instagram). */
export function xPostErrors(def, { env = process.env, post = buildXPost(def) } = {}) {
  const E = [];
  const x = def.x || {};
  if (x.text != null && typeof x.text !== 'string') E.push('x.text must be a string');
  if (x.slides != null) {
    const n = (def.slides || []).length;
    if (!Array.isArray(x.slides) || !x.slides.length || x.slides.length > 4) E.push('x.slides: 1–4 slide numbers (1-based, as out/<slug>/NN.jpg)');
    else {
      if (x.slides.some((v) => !Number.isInteger(v) || v < 1 || v > n)) E.push(`x.slides: integers 1..${n}`);
      if (new Set(x.slides).size !== x.slides.length) E.push('x.slides: no duplicates');
    }
  }
  if (x.replyPath != null && !pageFor(x.replyPath)) E.push('x.replyPath: a coloprice.com page path, e.g. "/pipeline/"');
  const text = post.text || '';
  if (!text) E.push('post text is empty');
  const len = tweetLength(text);
  if (len > X_MAX) E.push(`post is ${len} weighted chars > ${X_MAX}`);
  if (hasLink(text)) E.push('no URL or domain in the main post (links cut reach on X) — the link goes in the reply');
  if (/link in bio/i.test(text)) E.push('"link in bio" is Instagram wording — not for X');
  // X automation rules forbid automated unsolicited @mentions: operators are named in plain text on X.
  if (/(^|[\s(])@[A-Za-z0-9_]/.test(text)) E.push('no @mentions in automated X posts (X automation rules) — name the company in plain text');
  if (/#\w/.test(text) && x.text == null) E.push('derived text must not carry hashtags');
  const corpus = factNumbers(def);
  const miss = missingNumbers(text, corpus);
  if (miss.length) E.push(`number(s) ${miss.join(', ')} in the post are not in any source/data-hook facts or derived[] — no invented numbers`);
  post.alts.forEach((a, i) => {
    if (!a) E.push(`alt text for slide ${post.slides[i]} is empty`);
    if (a.length > ALT_MAX) E.push(`alt text for slide ${post.slides[i]} > ${ALT_MAX} chars`);
    const m = missingNumbers(a, corpus);
    if (m.length) E.push(`alt text for slide ${post.slides[i]}: number(s) ${m.join(', ')} not in the facts`);
  });
  if (tweetLength(post.reply) > X_MAX) E.push('reply > 280 chars');
  const replyDomains = post.reply.match(/\b[a-z0-9-]+\.(com|net|org|io|ai|co)\b/gi) || [];
  if (replyDomains.some((d) => d.toLowerCase() !== 'coloprice.com')) E.push('reply may only link to coloprice.com');
  E.push(...safetyErrors([text, post.reply, ...post.alts].join('\n'), env));
  return E;
}
