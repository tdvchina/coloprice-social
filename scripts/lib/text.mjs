// Text engine: bundled fonts -> outlined SVG paths (no system fonts, no <text>).
// sharp/librsvg never has to resolve a font, so CI output == local output.
//
// Fonts (fonts/, SIL OFL 1.1):
//   Inter Regular / Medium (static TTF, weights 400 and 500 — DESIGN.md caps at 590)
//   JetBrains Mono Regular / Medium (latin subset WOFF) — every number, tabular by design
// Missing glyphs in a font fall back to the next font of the stack (mono -> Inter).
import opentype from 'opentype.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FONT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../fonts');
const load = (f) => opentype.loadSync(resolve(FONT_DIR, f));

const INTER_400 = load('Inter-Regular.ttf');
const INTER_500 = load('Inter-Medium.ttf');
const MONO_400 = load('JetBrainsMono-Regular-latin.woff');
const MONO_500 = load('JetBrainsMono-Medium-latin.woff');

export const FONTS = {
  sans: [INTER_400],
  sansMedium: [INTER_500],
  mono: [MONO_400, INTER_400],
  monoMedium: [MONO_500, INTER_500],
};

function pickFont(stack, ch) {
  for (const f of stack) if (f.charToGlyphIndex(ch) !== 0) return f;
  return null;
}

/** Characters no font in the stack can draw (validator reports them). */
export function unsupportedChars(str, stack = FONTS.sans) {
  const out = new Set();
  for (const ch of String(str)) {
    if (ch === ' ' || ch === '\n') continue;
    if (!pickFont(stack, ch)) out.add(ch);
  }
  return [...out];
}

/**
 * Lay out one line. Returns { d, width } where d is SVG path data.
 * tracking is in em (e.g. -0.022 like DESIGN.md for large sizes).
 */
export function shapeLine(str, { font = FONTS.sans, size, x = 0, y = 0, tracking = 0, draw = true }) {
  const stack = Array.isArray(font) ? font : [font];
  let cx = x;
  let d = '';
  let prev = null;
  let prevFont = null;
  const chars = [...String(str)];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const f = pickFont(stack, ch) || stack[0];
    const scale = size / f.unitsPerEm;
    const g = f.charToGlyph(ch);
    if (prev && prevFont === f) cx += f.getKerningValue(prev, g) * scale;
    if (draw) {
      const p = g.getPath(cx, y, size).toPathData(1);
      if (p) d += p;
    }
    // monospace word spaces read as holes at display sizes ("280  MW"): tighten them
    const tighten = ch === ' ' && size >= 60 && (f === MONO_400 || f === MONO_500) ? 0.45 : 1;
    cx += g.advanceWidth * scale * tighten;
    if (i < chars.length - 1) cx += tracking * size;
    prev = g;
    prevFont = f;
  }
  return { d, width: cx - x };
}

export const measure = (str, opts) => shapeLine(str, { ...opts, draw: false }).width;

/** Greedy word wrap by real glyph widths. Returns lines or null if a single word cannot fit. */
export function wrapLines(text, { font, size, tracking = 0, maxWidth }) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (measure(candidate, { font, size, tracking }) <= maxWidth) {
      line = candidate;
    } else {
      if (!line) return null; // single word wider than the box
      lines.push(line);
      line = w;
      if (measure(line, { font, size, tracking }) > maxWidth) return null;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Largest size in [minSize, maxSize] (step 2) where text wraps into <= maxLines.
 * Returns { size, lines, ok }. ok=false means it did not fit even at minSize
 * (lines then holds the overflowing layout at minSize, for error messages).
 */
export function fitText(text, { font = FONTS.sans, maxSize, minSize, maxWidth, maxLines = 1, tracking = 0 }) {
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = wrapLines(text, { font, size, tracking, maxWidth });
    if (lines && lines.length <= maxLines) return { size, lines, ok: true };
  }
  const lines = wrapLines(text, { font, size: minSize, tracking, maxWidth }) || [String(text)];
  return { size: minSize, lines, ok: false };
}

/** Truncate a single line with an ellipsis so it fits maxWidth. */
export function ellipsize(text, { font, size, tracking = 0, maxWidth }) {
  let s = String(text);
  if (measure(s, { font, size, tracking }) <= maxWidth) return s;
  while (s.length > 1 && measure(s + '…', { font, size, tracking }) > maxWidth) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

/**
 * Render text as a <path>. anchor: start | end | middle.
 * Returns { svg, width }.
 */
export function textPath(str, { font = FONTS.sans, size, x, y, fill, tracking = 0, anchor = 'start', opacity }) {
  const width = measure(str, { font, size, tracking });
  const sx = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  const { d } = shapeLine(str, { font, size, x: sx, y, tracking });
  const op = opacity != null ? ` opacity="${opacity}"` : '';
  return { svg: d ? `<path d="${d}" fill="${fill}"${op}/>` : '', width };
}

/** Multi-line block; top = y of the first line's top edge. Returns { svg, height }. */
export function textBlock(lines, { font = FONTS.sans, size, x, top, lineHeight = 1.2, fill, tracking = 0, anchor = 'start' }) {
  const lh = size * lineHeight;
  let svg = '';
  lines.forEach((l, i) => {
    // baseline ≈ top + 0.8·size for Inter/JetBrains (cap height ~0.73em)
    svg += textPath(l, { font, size, x, y: top + i * lh + size * 0.8, fill, tracking, anchor }).svg;
  });
  return { svg, height: lines.length ? (lines.length - 1) * lh + size : 0 };
}
