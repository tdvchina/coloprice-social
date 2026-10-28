// Content rules shared by every channel (Instagram validator, X publisher):
// number extraction, "no invented numbers" corpus, investment/client/guarantee patterns
// and the CONTENT_DENYLIST check. One source of truth, so X can never be looser than Instagram.

export const INVEST =
  /\b(buy|sell|short|go long on)\s+(the\s+)?(stock|stocks|shares|equity|reit)\b|\b(strong buy|price target|investment advice|financial advice|you should invest|time to invest|guaranteed returns?|can'?t lose|to the moon|undervalued stock|overweight rating)\b/i;
export const CLIENT = /\b(our (client|customer)s?|a client of ours|we('| a)re (brokering|negotiating)|under nda|signed an nda|loi with us|exclusive mandate|our deal pipeline|deal we('| a)re working)\b/i;
export const GUARANTEE = /\bguarantee[ds]?\b/i;

// ── number extraction ──
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_PATTERNS = [
  /\b(19|20)\d{2}-\d{2}(-\d{2})?\b/g,
  new RegExp(`\\b${MONTH}\\s+'?\\d{2}(\\d{2})?\\b`, 'gi'),
  new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+${MONTH}(\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b${MONTH}\\s+\\d{1,2},?\\s+\\d{4}`, 'gi'),
];
export function numbersIn(text, { skipLetterPrefixed = true, stripDates = true } = {}) {
  let s = String(text ?? '');
  if (stripDates) for (const re of DATE_PATTERNS) s = s.replace(re, ' ');
  const out = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(s))) {
    const before = s[m.index - 1] || '';
    if (skipLetterPrefixed && /[A-Za-z]/.test(before)) continue; // H100, Q4, TYO1, MI300X
    if (/\d/.test(before)) continue;
    const raw = m[0].replace(/,(?=\d{3}\b)/g, '').replace(/,$/, '');
    const v = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(v)) continue;
    if (Number.isInteger(v) && v >= 1990 && v <= 2039 && !raw.includes('.')) continue; // years
    out.push(v);
  }
  return out;
}
export const same = (a, b) => Math.abs(a - b) < 1e-9 || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < 1e-6;

const factNums = (facts) => facts.flatMap((f) => numbersIn(f, { skipLetterPrefixed: false, stripDates: false }));

/** Facts per source/data-hook id (dates included, as the validator always did). */
export function refFactsOf(def) {
  const out = {};
  for (const s of def.sources || []) if (s.id) out[s.id] = [...(s.facts || []), s.date || ''];
  for (const d of def.dataHooks || []) if (d.id) out[d.id] = [...(d.facts || []), d.asOf || ''];
  return out;
}
/** Numbers from derived[].value (the arithmetic itself lives in derived[].how). */
export const derivedNumbers = (def) => (def.derived || []).flatMap((d) => numbersIn(d.value, { skipLetterPrefixed: false, stripDates: false }));

/** Every number a carousel may show anywhere: all cited facts + derived values. */
export const factNumbers = (def) => [...factNums(Object.values(refFactsOf(def)).flat()), ...derivedNumbers(def)];

/** Numbers in `text` that are not in `corpus` (unique). */
export const missingNumbers = (text, corpus) => [...new Set(numbersIn(text).filter((v) => !corpus.some((c) => same(c, v))))];

/**
 * Investment advice / own clients / guarantees / CONTENT_DENYLIST. Returns error strings.
 * Denylisted terms are NEVER echoed: CI logs of a public repo are public.
 */
export function safetyErrors(text, env = process.env, { prefix = '' } = {}) {
  const errors = [];
  const t = String(text || '');
  if (INVEST.test(t)) errors.push(`${prefix}content reads as investment advice — facts only, no buy/sell framing`);
  if (CLIENT.test(t)) errors.push(`${prefix}content mentions clients/deals of our own — never publish client names or deal info`);
  if (GUARANTEE.test(t)) errors.push(`${prefix}no "guarantee" claims (prices/terms are individual)`);
  const deny = String(env.CONTENT_DENYLIST || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  deny.forEach((term, i) => {
    if (t.toLowerCase().includes(term)) errors.push(`${prefix}content matches CONTENT_DENYLIST entry #${i + 1} (client/deal name) — remove it`);
  });
  return errors;
}
