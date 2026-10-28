// Slide templates (Coloprice style, DESIGN.md).
//   types:   cover · stat · list · chart · compare · map · quote · closing
//   covers:  layout standard | poster | split | compare | map | quote
//   themes:  dark | paper | lime  (def.theme = carousel default, slide.theme = override;
//            split covers take slide.tones = [first panel, second panel])
// Every template returns { svg, issues } — issues are layout overflows that the
// validator turns into hard errors (no clipped text ever reaches Instagram).
import { COLORS as C, SLIDE, LOGO_BARS, SITE, THEMES } from '../../config/brand.mjs';
import { FONTS, fitText, textPath, textBlock, measure, ellipsize, wrapLines } from './text.mjs';
import { REGIONS, projection, landDots } from './map.mjs';

const { W, H, PAD } = SLIDE;
const CW = W - PAD * 2; // content width 920
const CONTENT_TOP = 210;
const CONTENT_BOTTOM = 1196; // nothing below this except the footer
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const COVER_LAYOUTS = ['standard', 'poster', 'split', 'compare', 'map', 'quote'];
let uid = 0;

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "DCD, 27 Oct 2026 · Coloprice GPU index, 16 Oct 2026" for the slide's refs. */
export function refLabel(refs, ctx) {
  const parts = [];
  for (const id of refs || []) {
    const s = ctx.refs[id];
    if (!s) continue;
    const label = s.kind === 'data' ? s.dataset || 'Coloprice index' : s.publisher;
    const date = s.kind === 'data' ? s.asOf : s.date;
    const item = `${label}, ${fmtDate(date)}`;
    if (!parts.includes(item)) parts.push(item);
  }
  if (!parts.length) return '';
  return (parts.length > 1 ? 'Sources: ' : 'Source: ') + parts.join(' · ');
}

/** `**word**` marks highlighted words in quote/statement text. */
export const stripMarks = (t) => String(t ?? '').replace(/\*\*/g, '');

export function themeName(s, ctx) {
  return s?.theme || ctx?.def?.theme || 'dark';
}
const themeByName = (n) => THEMES[n] || THEMES.dark;
const themeOf = (s, ctx) => themeByName(themeName(s, ctx));

// ── shared chrome ─────────────────────────────────────────────────────────

function logo(T, x, bottom, scale) {
  const bars = (bx, bb, sc) =>
    LOGO_BARS.map((b) => `<rect x="${(bx + b.x * sc).toFixed(1)}" y="${(bb - b.h * sc).toFixed(1)}" width="${(b.w * sc).toFixed(1)}" height="${(b.h * sc).toFixed(1)}" fill="${b.fill}"/>`).join('');
  if (T.logo !== 'badge') return { svg: bars(x, bottom, scale), width: 18 * scale };
  // light grounds: the three-bar mark sits in a void tile (the favicon), so the lime bar keeps its contrast
  const size = 20 * scale;
  const top = bottom - size;
  const sc = scale * 0.6;
  return {
    svg: `<rect x="${x}" y="${top}" width="${size}" height="${size}" rx="${(size * 0.22).toFixed(1)}" fill="${C.void}"/>` + bars(x + (size - 18 * sc) / 2, top + (size + 20 * sc) / 2, sc),
    width: size,
  };
}

function background(T, box = { x: 0, y: 0, w: W, h: H }) {
  const id = `g${++uid}`;
  let grid = '';
  for (let x = 120; x < W; x += 120) if (x > box.x && x < box.x + box.w) grid += `<line x1="${x}" y1="${box.y}" x2="${x}" y2="${box.y + box.h}"/>`;
  for (let y = 120; y < H; y += 120) if (y > box.y && y < box.y + box.h) grid += `<line x1="${box.x}" y1="${y}" x2="${box.x + box.w}" y2="${y}"/>`;
  return `<defs>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="${id}m"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#${id}f)"/></mask>
  </defs>
  <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${T.bg}"/>
  <g stroke="${T.grid}" stroke-width="1" mask="url(#${id}m)" opacity="${T.gridOpacity}">${grid}</g>`;
}

function header(T, rightText, rightT = T) {
  const base = 122;
  const lg = logo(T, PAD, base, 3);
  const word = textPath('Coloprice', { font: FONTS.sansMedium, size: 36, x: PAD + lg.width + 20, y: base - 2, fill: T.ink, tracking: -0.02 });
  const right = rightText
    ? textPath(rightText, { font: FONTS.mono, size: 24, x: W - PAD, y: base - 4, fill: rightT.muted, anchor: 'end', tracking: 0.04 }).svg
    : '';
  return `${lg.svg}${word.svg}${right}
  <line x1="${PAD}" y1="160" x2="${W - PAD}" y2="160" stroke="${T.hair}" stroke-width="1.5"/>`;
}

function footer(slide, ctx, T) {
  const site = textPath(SITE, { font: FONTS.sansMedium, size: 26, x: PAD, y: 1290, fill: T.body });
  const label = refLabel(slide.refs, ctx);
  let src = '';
  if (label) {
    const maxWidth = CW - site.width - 48;
    if (measure(label, { font: FONTS.mono, size: 20 }) <= maxWidth) {
      src = textPath(label, { font: FONTS.mono, size: 20, x: W - PAD, y: 1288, fill: T.muted, anchor: 'end' }).svg;
    } else {
      // two right-aligned lines: split at " · " when possible, else word-wrap
      const parts = label.split(' · ');
      let lines = parts.length > 1 ? [parts.slice(0, -1).join(' · ') + ' ·', parts[parts.length - 1]] : null;
      const fitsAll = (ls) => ls && ls.every((l) => measure(l, { font: FONTS.mono, size: 18 }) <= maxWidth);
      if (!fitsAll(lines)) lines = (fitText(label, { font: FONTS.mono, maxSize: 18, minSize: 18, maxWidth, maxLines: 2 }).lines || []).slice(0, 2);
      lines = lines.map((l) => ellipsize(l, { font: FONTS.mono, size: 18, maxWidth }));
      src = lines.map((l, i) => textPath(l, { font: FONTS.mono, size: 18, x: W - PAD, y: 1276 + i * 26, fill: T.muted, anchor: 'end' }).svg).join('');
    }
  }
  return `<line x1="${PAD}" y1="1232" x2="${W - PAD}" y2="1232" stroke="${T.hair}" stroke-width="1.5"/>${site.svg}${src}`;
}

function swipe(T, y = 1192) {
  const sw = textPath('SWIPE', { font: FONTS.monoMedium, size: 22, x: W - PAD - 64, y, fill: T.muted, anchor: 'end', tracking: 0.16 });
  return sw.svg + arrow(W - PAD - 48, y - 8, 48, T.swipe);
}

/** Shift a content block down by half of the free space (optical centring), capped. */
function centre(svg, yEnd, limit, cap = 120) {
  const dy = Math.max(0, Math.min(cap, (limit - yEnd) / 2));
  return dy > 4 ? `<g transform="translate(0 ${dy.toFixed(1)})">${svg}</g>` : svg;
}

const counter = (ctx) => `${ctx.dateLabel ? ctx.dateLabel + '  ·  ' : ''}${String(ctx.index).padStart(2, '0')}/${String(ctx.total).padStart(2, '0')}`;

function wrapSvg(inner) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

/** Fit + draw a text block, recording an issue if it overflows. Returns { svg, height, size, lines }. */
function block(text, opts, issues, what) {
  const { font, maxSize, minSize, maxLines, maxWidth = CW, tracking = 0, x = PAD, top, fill, lineHeight = 1.2, anchor = 'start' } = opts;
  const fit = fitText(text, { font, maxSize, minSize, maxWidth, maxLines, tracking });
  if (!fit.ok) issues.push(`${what}: does not fit ${maxLines} line(s) even at ${minSize}px — shorten it`);
  const lines = fit.lines.slice(0, maxLines);
  const b = textBlock(lines, { font, size: fit.size, x, top, lineHeight, fill, tracking, anchor });
  return { ...b, size: fit.size, lines };
}

/** Big mono figure. Lime on dark; void + lime highlighter marker on paper; void on lime. */
function figure(value, { size, x, top, T, accent = true, anchor = 'start', tracking = -0.04 }) {
  const font = FONTS.monoMedium;
  const width = measure(value, { font, size, tracking });
  const sx = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  const base = top + size * 0.8;
  let svg = '';
  if (accent && T.marker) {
    const m = size * 0.07;
    svg += `<rect x="${(sx - m).toFixed(1)}" y="${(base - size * 0.34).toFixed(1)}" width="${(width + 2 * m).toFixed(1)}" height="${(size * 0.42).toFixed(1)}" fill="${T.marker}"/>`;
  }
  svg += textPath(value, { font, size, x: sx, y: base, fill: accent ? T.figure : T.figureAlt, tracking }).svg;
  return { svg, width, height: size * 0.86 };
}

/** Text with `**highlighted**` words. Wraps like fitText; returns { svg, height, size, ok }. */
function richBlock(text, { font, maxSize, minSize, maxLines, maxWidth = CW, x = PAD, top, fill, T, lineHeight = 1.14, tracking = 0 }, issues, what) {
  // words made of segments, so "**power**," highlights "power" but not the comma
  const words = [];
  let hl = false;
  for (const raw of String(text).trim().split(/\s+/)) {
    const segs = [];
    for (const part of raw.split(/(\*\*)/)) {
      if (part === '**') hl = !hl;
      else if (part) segs.push({ t: part, hl });
    }
    if (segs.length) words.push({ w: segs.map((x) => x.t).join(''), segs });
  }
  const plain = words.map((w) => w.w).join(' ');
  const fit = fitText(plain, { font, maxSize, minSize, maxWidth, maxLines, tracking });
  if (!fit.ok) issues.push(`${what}: does not fit ${maxLines} line(s) even at ${minSize}px — shorten it`);
  const size = fit.size;
  const lh = size * lineHeight;
  const space = measure('a a', { font, size, tracking }) - measure('aa', { font, size, tracking });
  let svg = '';
  let wi = 0;
  fit.lines.slice(0, maxLines).forEach((line, li) => {
    const n = line.split(' ').length;
    const lw = words.slice(wi, wi + n);
    wi += n;
    const lineTop = top + li * lh;
    const base = lineTop + size * 0.8;
    let cx = x;
    // flatten to positioned segments; a space between two highlighted segments is highlighted too
    const pos = [];
    lw.forEach((w, wi2) => {
      for (const sg of w.segs) {
        const width = measure(sg.t, { font, size, tracking });
        pos.push({ ...sg, x: cx, width });
        cx += width;
      }
      if (wi2 < lw.length - 1) cx += space;
    });
    if (T.hlMode === 'marker') {
      // merge consecutive highlighted segments into one marker bar
      for (let i = 0; i < pos.length; i++) {
        if (!pos[i].hl) continue;
        let j = i;
        while (j + 1 < pos.length && pos[j + 1].hl) j++;
        const x0 = pos[i].x - size * 0.08;
        const x1 = pos[j].x + pos[j].width + size * 0.08;
        svg += `<rect x="${x0.toFixed(1)}" y="${(lineTop + size * 0.06).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(size * 0.98).toFixed(1)}" fill="${T.hlFill}"/>`;
        i = j;
      }
    }
    for (const p of pos) svg += textPath(p.t, { font, size, x: p.x, y: base, fill: p.hl ? T.hlText : fill, tracking }).svg;
  });
  const nLines = Math.min(fit.lines.length, maxLines);
  return { svg, height: nLines ? (nLines - 1) * lh + size : 0, size, ok: fit.ok };
}

function arrow(x, y, len, color, dir = 'right') {
  if (dir === 'right') {
    return `<path d="M${x} ${y}H${x + len}M${x + len - 12} ${y - 10}L${x + len} ${y}L${x + len - 12} ${y + 10}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return '';
}

function triangle(cx, cy, size, dir, color) {
  const h = size * 0.86;
  return dir === 'down'
    ? `<path d="M${cx - size / 2} ${cy - h / 2}H${cx + size / 2}L${cx} ${cy + h / 2}Z" fill="${color}"/>`
    : `<path d="M${cx - size / 2} ${cy + h / 2}H${cx + size / 2}L${cx} ${cy - h / 2}Z" fill="${color}"/>`;
}

const deltaColor = (dir, T) => (dir === 'down' ? T.down : dir === 'up' ? T.up : T.flat);

function deltaPill(delta, x, top, T) {
  const color = deltaColor(delta.dir, T);
  const size = 26;
  const tw = measure(delta.value, { font: FONTS.monoMedium, size });
  const hasTri = delta.dir === 'up' || delta.dir === 'down';
  const w = 24 + (hasTri ? 30 : 0) + tw + 24;
  const h = 56;
  const tri = hasTri ? triangle(x + 24 + 9, top + h / 2, 18, delta.dir, color) : '';
  const t = textPath(delta.value, { font: FONTS.monoMedium, size, x: x + 24 + (hasTri ? 30 : 0), y: top + h / 2 + 9, fill: color });
  return {
    svg: `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="28" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-opacity="0.5"/>${tri}${t.svg}`,
    height: h,
  };
}

function kicker(text, x, y, T, issues, maxW = CW) {
  const t = String(text).toUpperCase();
  const tw = measure(t, { font: FONTS.monoMedium, size: 22, tracking: 0.12 });
  const w = 22 + 12 + 16 + tw + 26;
  if (w > maxW) issues.push('kicker: too long');
  return {
    svg: `<rect x="${x}" y="${y}" width="${w}" height="52" rx="26" fill="${T.pill}" stroke="${T.pillStroke}" stroke-width="1.5"/>
      <circle cx="${x + 22 + 6}" cy="${y + 26}" r="6" fill="${T.pillDot}"/>` +
      textPath(t, { font: FONTS.monoMedium, size: 22, x: x + 22 + 12 + 16, y: y + 34, fill: T.pillText, tracking: 0.12 }).svg,
    height: 52,
  };
}

// ── covers ────────────────────────────────────────────────────────────────

function cover(s, ctx) {
  const layout = s.layout || 'standard';
  const fn = { standard: coverStandard, poster: coverPoster, split: coverSplit, compare: coverCompare, map: coverMap, quote: coverQuote }[layout];
  if (!fn) return { svg: null, issues: [`unknown cover layout "${layout}"`] };
  return fn(s, ctx);
}

function coverStandard(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  const chrome = background(T) + header(T, ctx.dateLabel || '');
  let out = '';
  let y = CONTENT_TOP + 24;
  if (s.kicker) {
    out += kicker(s.kicker, PAD, y, T, issues).svg;
    y += 52 + 48;
  }
  const hl = block(s.headline, { font: FONTS.sansMedium, maxSize: 92, minSize: 60, maxLines: 2, tracking: -0.022, top: y, fill: T.ink, lineHeight: 1.08 }, issues, 'headline');
  out += hl.svg;
  y += hl.height + 72;
  if (s.figure) {
    const vf = fitText(s.figure.value, { font: FONTS.monoMedium, maxSize: 240, minSize: 110, maxWidth: CW, maxLines: 1, tracking: -0.04 });
    if (!vf.ok) issues.push('figure.value: too wide even at 110px');
    out += figure(vf.lines[0], { size: vf.size, x: PAD - vf.size * 0.03, top: y, T }).svg;
    y += vf.size * 0.86 + 34;
    if (s.figure.label) {
      const lb = block(s.figure.label, { font: FONTS.sans, maxSize: 38, minSize: 30, maxLines: 2, top: y, fill: T.body, lineHeight: 1.3 }, issues, 'figure.label');
      out += lb.svg;
      y += lb.height + 40;
    }
  }
  if (s.deck) {
    y += 8;
    const dk = block(s.deck, { font: FONTS.sans, maxSize: 34, minSize: 28, maxLines: 3, top: y, fill: T.muted, lineHeight: 1.35 }, issues, 'deck');
    out += dk.svg;
    y += dk.height;
  }
  if (y > 1130) issues.push(`cover: content runs to y=${Math.round(y)} (limit 1130) — drop the deck or shorten the headline`);
  out = chrome + centre(out, y, 1110, 90) + swipe(T) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

/** Poster: one giant number fills the slide; headline above, label below. */
function coverPoster(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, ctx.dateLabel || '');
  let y = CONTENT_TOP + 24;
  if (s.kicker) {
    out += kicker(s.kicker, PAD, y, T, issues).svg;
    y += 52 + 44;
  }
  const hl = block(s.headline, { font: FONTS.sansMedium, maxSize: 76, minSize: 56, maxLines: 2, tracking: -0.022, top: y, fill: T.ink, lineHeight: 1.08 }, issues, 'headline');
  out += hl.svg;
  y += hl.height;
  if (!s.figure) issues.push('poster cover needs figure.value');
  const value = s.figure?.value || '';
  const vf = fitText(value, { font: FONTS.monoMedium, maxSize: 440, minSize: 150, maxWidth: CW, maxLines: 1, tracking: -0.05 });
  if (!vf.ok) issues.push('figure.value: too wide for a poster even at 150px — shorten it or use layout "standard"');
  // label block height first, so the number can sit in the optical centre of what is left
  let label = null;
  if (s.figure?.label) {
    const f = fitText(s.figure.label, { font: FONTS.sans, maxSize: 40, minSize: 30, maxWidth: CW, maxLines: 2 });
    if (!f.ok) issues.push('figure.label: does not fit 2 lines');
    label = { f, h: (Math.min(f.lines.length, 2) - 1) * f.size * 1.3 + f.size };
  }
  const figH = vf.size * 0.74; // cap height of mono digits
  const desc = /[$,;gjpqy]/.test(value) ? vf.size * 0.12 : 0; // "$" and commas hang below the baseline
  const asc = /[$]/.test(value) ? vf.size * 0.1 : 0; // "$" also rises above the digits
  const gapL = desc + 56;
  const restH = asc + figH + (label ? gapL + label.h : 0);
  const limit = 1140;
  const free = limit - y - restH;
  if (free < 60) issues.push('poster: headline + number + label do not fit — shorten the headline or label');
  // glyph top (digits start ~0.06em below the em box; "$" pokes out above them)
  const figTop = y + asc + Math.max(64, free * 0.42) - vf.size * 0.06;
  out += figure(vf.lines[0], { size: vf.size, x: PAD - vf.size * 0.035, top: figTop, T, tracking: -0.05 }).svg;
  if (label) {
    const ly = figTop + vf.size * 0.8 + gapL;
    out += `<line x1="${PAD}" y1="${ly - 22}" x2="${PAD + 72}" y2="${ly - 22}" stroke="${T.rule}" stroke-width="3"/>`;
    out += textBlock(label.f.lines.slice(0, 2), { font: FONTS.sans, size: label.f.size, x: PAD, top: ly, fill: T.body, lineHeight: 1.3 }).svg;
  }
  out += swipe(T) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

/**
 * Split: two tones. split "rows" (default) = headline panel on top, figure panel below (full bleed).
 * split "cols" = headline column left, figure panel right (bleeds off the right edge).
 */
function coverSplit(s, ctx) {
  const issues = [];
  const [ta, tb] = (s.tones && s.tones.length === 2 ? s.tones : [themeName(s, ctx), themeName(s, ctx) === 'lime' ? 'dark' : 'lime']).map(themeByName);
  if (ta === tb) issues.push('split: tones must be two different themes');
  return (s.split || 'rows') === 'cols' ? splitCols(s, ctx, ta, tb, issues) : splitRows(s, ctx, ta, tb, issues);
}

function splitRows(s, ctx, A, B, issues) {
  const SPLIT = 724;
  let out = background(A, { x: 0, y: 0, w: W, h: SPLIT }) + header(A, ctx.dateLabel || '');
  // top panel: kicker + headline anchored to the bottom edge of the panel (editorial)
  const hf = fitText(s.headline, { font: FONTS.sansMedium, maxSize: 92, minSize: 60, maxWidth: CW, maxLines: 2, tracking: -0.022 });
  if (!hf.ok) issues.push('headline: does not fit 2 lines even at 60px — shorten it');
  const hh = (Math.min(hf.lines.length, 2) - 1) * hf.size * 1.08 + hf.size;
  const hTop = SPLIT - 72 - hh;
  if (s.kicker) {
    const ky = Math.max(CONTENT_TOP + 10, hTop - 52 - 44);
    out += kicker(s.kicker, PAD, ky, A, issues).svg;
    if (ky + 52 + 20 > hTop) issues.push('split: kicker collides with headline');
  }
  out += textBlock(hf.lines.slice(0, 2), { font: FONTS.sansMedium, size: hf.size, x: PAD, top: hTop, fill: A.ink, lineHeight: 1.08, tracking: -0.022 }).svg;
  // bottom panel (full bleed, carries footer)
  out += `<rect x="0" y="${SPLIT}" width="${W}" height="${H - SPLIT}" fill="${B.bg}"/>`;
  let y = SPLIT + 64;
  if (!s.figure) issues.push('split cover needs a figure');
  const vf = fitText(s.figure?.value || '', { font: FONTS.monoMedium, maxSize: 250, minSize: 110, maxWidth: CW, maxLines: 1, tracking: -0.045 });
  if (!vf.ok) issues.push('figure.value: too wide even at 110px');
  out += figure(vf.lines[0] || '', { size: vf.size, x: PAD - vf.size * 0.03, top: y, T: B, tracking: -0.045 }).svg;
  y += vf.size * 0.86 + 30;
  if (s.figure?.label) {
    const lb = block(s.figure.label, { font: FONTS.sans, maxSize: 36, minSize: 28, maxLines: 2, top: y, fill: B.body, lineHeight: 1.3 }, issues, 'figure.label');
    out += lb.svg;
    y += lb.height;
  }
  if (y > 1160) issues.push(`split: figure panel runs to y=${Math.round(y)} (limit 1160) — shorten the label`);
  out += swipe(B, 1196) + footer(s, ctx, B);
  return { svg: wrapSvg(out), issues };
}

function splitCols(s, ctx, A, B, issues) {
  const PX = 640; // panel starts here
  const PT = 196;
  const PB = 1212;
  const colW = PX - PAD - 48;
  let out = background(A) + header(A, ctx.dateLabel || '');
  out += `<rect x="${PX}" y="${PT}" width="${W - PX}" height="${PB - PT}" fill="${B.bg}"/>`;
  // left column: kicker, headline, deck — vertically centred in the panel's span
  let parts = '';
  let y = 0;
  if (s.kicker) {
    parts += kicker(s.kicker, PAD, y, A, issues, colW).svg;
    y += 52 + 44;
  }
  const hl = block(s.headline, { font: FONTS.sansMedium, maxSize: 76, minSize: 52, maxLines: 2, maxWidth: colW, tracking: -0.022, top: y, fill: A.ink, lineHeight: 1.08 }, issues, 'headline');
  parts += hl.svg;
  y += hl.height;
  if (s.deck) {
    y += 40;
    const dk = block(s.deck, { font: FONTS.sans, maxSize: 34, minSize: 28, maxLines: 5, maxWidth: colW, top: y, fill: A.muted, lineHeight: 1.35 }, issues, 'deck');
    parts += dk.svg;
    y += dk.height;
  }
  const leftTop = PT + Math.max(40, (PB - PT - y) / 2);
  out += `<g transform="translate(0 ${leftTop.toFixed(1)})">${parts}</g>`;
  // right panel: figure stacked over its label
  const inner = W - PX - 64 - 40;
  const vf = fitText(s.figure?.value || '', { font: FONTS.monoMedium, maxSize: 260, minSize: 100, maxWidth: inner, maxLines: 1, tracking: -0.045 });
  if (!vf.ok) issues.push('figure.value: too wide for the split panel even at 100px');
  let lab = null;
  if (s.figure?.label) {
    const f = fitText(s.figure.label, { font: FONTS.sans, maxSize: 32, minSize: 26, maxWidth: inner, maxLines: 5 });
    if (!f.ok) issues.push('figure.label: does not fit 5 lines in the split panel');
    lab = { f, h: (Math.min(f.lines.length, 5) - 1) * f.size * 1.3 + f.size };
  }
  const blockH = vf.size * 0.86 + (lab ? 36 + lab.h : 0);
  const fy = PT + (PB - PT - blockH) / 2;
  out += figure(vf.lines[0] || '', { size: vf.size, x: PX + 56 - vf.size * 0.03, top: fy, T: B, tracking: -0.045 }).svg;
  if (lab) out += textBlock(lab.f.lines.slice(0, 5), { font: FONTS.sans, size: lab.f.size, x: PX + 56, top: fy + vf.size * 0.86 + 36, fill: B.body, lineHeight: 1.3 }).svg;
  out += footer(s, ctx, A);
  return { svg: wrapSvg(out), issues };
}

/** Comparison cover: headline + two big numbers side by side (+ optional verdict). */
function coverCompare(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, ctx.dateLabel || '');
  let y = CONTENT_TOP + 24;
  let body = '';
  if (s.kicker) {
    body += kicker(s.kicker, PAD, y, T, issues).svg;
    y += 52 + 44;
  }
  const hl = block(s.headline, { font: FONTS.sansMedium, maxSize: 84, minSize: 56, maxLines: 2, tracking: -0.022, top: y, fill: T.ink, lineHeight: 1.08 }, issues, 'headline');
  body += hl.svg;
  y += hl.height + 80;
  const cb = compareBlock(s, T, y, 1130, issues);
  body += cb.svg;
  y += cb.height;
  if (y > 1140) issues.push(`compare cover: content runs to y=${Math.round(y)} (limit 1140)`);
  out += centre(body, y, 1110, 130) + swipe(T) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

/** Map cover: headline, a dot map with bubbles, the hook figure under it. */
function coverMap(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, ctx.dateLabel || '');
  let y = CONTENT_TOP + 24;
  if (s.kicker) {
    out += kicker(s.kicker, PAD, y, T, issues).svg;
    y += 52 + 40;
  }
  const hl = block(s.headline, { font: FONTS.sansMedium, maxSize: 80, minSize: 56, maxLines: 2, tracking: -0.022, top: y, fill: T.ink, lineHeight: 1.08 }, issues, 'headline');
  out += hl.svg;
  y += hl.height + 20;
  // figure row at the bottom
  let figSvg = '';
  let figH = 0;
  if (s.figure) {
    const vf = fitText(s.figure.value, { font: FONTS.monoMedium, maxSize: 150, minSize: 96, maxWidth: CW * 0.62, maxLines: 1, tracking: -0.04 });
    if (!vf.ok) issues.push('figure.value: too wide for the map cover');
    const fTop = 1140 - vf.size * 0.86;
    const fv = figure(vf.lines[0], { size: vf.size, x: PAD - vf.size * 0.03, top: fTop, T });
    figSvg += fv.svg;
    if (s.figure.label) {
      const lx = PAD + fv.width + 36;
      const lw = W - PAD - lx;
      const f = fitText(s.figure.label, { font: FONTS.sans, maxSize: 30, minSize: 24, maxWidth: lw, maxLines: 3 });
      if (!f.ok || lw < 220) issues.push('figure.label: does not fit beside the figure — shorten value or label');
      const lh = (Math.min(f.lines.length, 3) - 1) * f.size * 1.28 + f.size;
      figSvg += textBlock(f.lines.slice(0, 3), { font: FONTS.sans, size: f.size, x: lx, top: fTop + vf.size * 0.86 - lh - vf.size * 0.06, fill: T.body, lineHeight: 1.28 }).svg;
    }
    figH = vf.size * 0.86 + 40;
  }
  const box = { x: PAD, y, w: CW, h: 1140 - figH - y - 16 };
  if (box.h < 300) issues.push('map cover: not enough room for the map — shorten the headline');
  out += mapBlock(s, T, box, issues).svg + figSvg + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

/** Typographic statement cover; `**words**` get the highlight. Optional small figure row. */
function coverQuote(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, ctx.dateLabel || '');
  let y = CONTENT_TOP + 24;
  let body = '';
  if (s.kicker) {
    body += kicker(s.kicker, PAD, y, T, issues).svg;
    y += 52 + 56;
  }
  const st = richBlock(s.statement || s.headline || '', { font: FONTS.sansMedium, maxSize: 104, minSize: 66, maxLines: 4, top: y, fill: T.ink, T, lineHeight: 1.1, tracking: -0.025 }, issues, 'statement');
  body += st.svg;
  y += st.height;
  if (s.figure) {
    y += 72;
    body += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${T.hair}" stroke-width="1.5"/>`;
    y += 48;
    const vf = fitText(s.figure.value, { font: FONTS.monoMedium, maxSize: 120, minSize: 84, maxWidth: CW * 0.55, maxLines: 1, tracking: -0.04 });
    if (!vf.ok) issues.push('figure.value: too wide');
    const fv = figure(vf.lines[0], { size: vf.size, x: PAD - vf.size * 0.03, top: y, T });
    body += fv.svg;
    if (s.figure.label) {
      const lx = PAD + fv.width + 40;
      const f = fitText(s.figure.label, { font: FONTS.sans, maxSize: 30, minSize: 24, maxWidth: W - PAD - lx, maxLines: 3 });
      if (!f.ok) issues.push('figure.label: does not fit beside the figure');
      const lh = (Math.min(f.lines.length, 3) - 1) * f.size * 1.28 + f.size;
      body += textBlock(f.lines.slice(0, 3), { font: FONTS.sans, size: f.size, x: lx, top: y + (vf.size * 0.8 - lh) / 2 + vf.size * 0.04, fill: T.body, lineHeight: 1.28 }).svg;
    }
    y += vf.size * 0.86;
  }
  if (y > 1140) issues.push(`quote cover: content runs to y=${Math.round(y)} (limit 1140)`);
  out += centre(body, y, 1120, 110) + swipe(T) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

// ── inner slides ──────────────────────────────────────────────────────────

function stat(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  const chrome = background(T) + header(T, counter(ctx));
  let out = '';
  let y = CONTENT_TOP + 30;
  if (s.label) {
    const lb = block(String(s.label).toUpperCase(), { font: FONTS.monoMedium, maxSize: 26, minSize: 20, maxLines: 2, top: y, fill: T.muted, tracking: 0.1, lineHeight: 1.4 }, issues, 'label');
    out += lb.svg;
    y += lb.height + 56;
  }
  const vf = fitText(s.value, { font: FONTS.monoMedium, maxSize: 250, minSize: 100, maxWidth: CW, maxLines: 1, tracking: -0.04 });
  if (!vf.ok) issues.push('value: too wide even at 100px');
  out += figure(vf.lines[0], { size: vf.size, x: PAD - vf.size * 0.03, top: y, T, accent: s.accent !== false }).svg;
  y += vf.size * 0.86 + 36;
  if (s.unit) {
    const un = block(s.unit, { font: FONTS.sans, maxSize: 40, minSize: 30, maxLines: 2, top: y, fill: T.body, lineHeight: 1.25 }, issues, 'unit');
    out += un.svg;
    y += un.height + 36;
  }
  if (s.delta) {
    const dp = deltaPill(s.delta, PAD, y, T);
    out += dp.svg;
    y += dp.height + 24;
  }
  if (s.context) {
    y += 40;
    out += `<line x1="${PAD}" y1="${y - 28}" x2="${PAD + 72}" y2="${y - 28}" stroke="${T.rule}" stroke-width="3"/>`;
    const cx = block(s.context, { font: FONTS.sans, maxSize: 40, minSize: 30, maxLines: 6, top: y, fill: T.body, lineHeight: 1.36 }, issues, 'context');
    out += cx.svg;
    y += cx.height;
  }
  if (y > CONTENT_BOTTOM) issues.push(`stat: content runs to y=${Math.round(y)} (limit ${CONTENT_BOTTOM}) — shorten context`);
  out = chrome + centre(out, y, 1150, 130) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

function list(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, counter(ctx));
  let y = CONTENT_TOP + 20;
  const tt = block(s.title, { font: FONTS.sansMedium, maxSize: 64, minSize: 44, maxLines: 2, tracking: -0.022, top: y, fill: T.ink, lineHeight: 1.1 }, issues, 'title');
  out += tt.svg;
  y += tt.height + 22;
  if (s.unit) {
    out += textPath(String(s.unit).toUpperCase(), { font: FONTS.mono, size: 22, x: PAD, y: y + 22, fill: T.muted, tracking: 0.08 }).svg;
    y += 40;
  }
  y += 28;
  const rows = s.rows || [];
  const bottom = s.footnote ? CONTENT_BOTTOM - 50 : CONTENT_BOTTOM;
  const rowH = Math.min(rows.length <= 4 ? 196 : 164, Math.floor((bottom - y) / Math.max(rows.length, 1)));
  if (rowH < 96) issues.push(`list: ${rows.length} rows leave only ${rowH}px per row — use fewer rows or a shorter title`);
  const vSize = rowH >= 190 ? 58 : 46; // short lists get bigger figures instead of empty space
  rows.forEach((r, i) => {
    const top = y + i * rowH;
    const mid = top + rowH / 2;
    const hasSub = Boolean(r.note || r.delta);
    out += `<line x1="${PAD}" y1="${top}" x2="${W - PAD}" y2="${top}" stroke="${T.hair}" stroke-width="1.5"/>`;
    out += textPath(String(i + 1).padStart(2, '0'), { font: FONTS.monoMedium, size: 26, x: PAD, y: mid + 9, fill: r.highlight ? (T.marker ? T.ink : T.figure) : T.faint }).svg;
    const vw = measure(r.value, { font: FONTS.monoMedium, size: vSize });
    const valueY = hasSub ? mid + vSize * 0.05 : mid + vSize * 0.35;
    if (r.highlight) out += figure(r.value, { size: vSize, x: W - PAD, top: valueY - vSize * 0.8, T, anchor: 'end', tracking: 0 }).svg;
    else out += textPath(r.value, { font: FONTS.monoMedium, size: vSize, x: W - PAD, y: valueY, fill: T.ink, anchor: 'end' }).svg;
    if (r.delta) out += textPath(r.delta.value, { font: FONTS.monoMedium, size: 24, x: W - PAD, y: valueY + 38, fill: deltaColor(r.delta.dir, T), anchor: 'end' }).svg;
    const labelX = PAD + 76;
    const deltaW = r.delta ? measure(r.delta.value, { font: FONTS.monoMedium, size: 24 }) : 0;
    const labelMax = W - PAD - Math.max(vw, 0) - 36 - labelX;
    const lf = fitText(r.label, { font: FONTS.sans, maxSize: 38, minSize: 28, maxWidth: labelMax, maxLines: 1 });
    if (!lf.ok) issues.push(`rows[${i}].label "${r.label}": too long for the row`);
    const labelY = r.note ? mid - 4 : mid + 13;
    out += textPath(lf.lines[0], { font: FONTS.sans, size: lf.size, x: labelX, y: labelY, fill: T.body }).svg;
    if (r.note) {
      const noteMax = W - PAD - Math.max(deltaW, 0) - 36 - labelX;
      const note = ellipsize(r.note, { font: FONTS.sans, size: 24, maxWidth: noteMax });
      if (note !== r.note) issues.push(`rows[${i}].note: truncated — shorten it`);
      out += textPath(note, { font: FONTS.sans, size: 24, x: labelX, y: mid + 34, fill: T.muted }).svg;
    }
  });
  const end = y + rows.length * rowH;
  out += `<line x1="${PAD}" y1="${end}" x2="${W - PAD}" y2="${end}" stroke="${T.hair}" stroke-width="1.5"/>`;
  if (s.footnote) {
    const fn = block(s.footnote, { font: FONTS.sans, maxSize: 24, minSize: 20, maxLines: 2, top: end + 18, fill: T.muted, lineHeight: 1.3 }, issues, 'footnote');
    out += fn.svg;
  }
  out += footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

// ── chart helpers ──

export function formatValue(v, fmt = {}) {
  const { prefix = '', suffix = '', decimals } = fmt;
  // decimals unset: up to 2, trailing zeros dropped (7 -> "7", 70.8 -> "70.8", 3.49 -> "3.49")
  const opts = decimals == null ? { minimumFractionDigits: 0, maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return `${prefix}${Number(v).toLocaleString('en-US', opts)}${suffix}`;
}

function niceTicks(min, max, count = 5) {
  if (min === max) {
    min = min * 0.9;
    max = max * 1.1 || 1;
  }
  const span = max - min;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 1e6; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

function isHighlight(s, d, i) {
  if (d.highlight) return true;
  if (s.highlight == null) return false;
  return typeof s.highlight === 'number' ? s.highlight === i : s.highlight === d.label;
}

function barChart(s, top, bottom, issues, T) {
  const data = s.data;
  const n = data.length;
  const slot = CW / n;
  const barW = Math.min(slot * 0.58, 120);
  const labelZone = 84;
  const plotBottom = bottom - labelZone;
  const valueZone = 56;
  const max = Math.max(...data.map((d) => d.value));
  let out = `<line x1="${PAD}" y1="${plotBottom}" x2="${W - PAD}" y2="${plotBottom}" stroke="${T.rule}" stroke-width="2"/>`;
  data.forEach((d, i) => {
    const cx = PAD + slot * i + slot / 2;
    const h = max > 0 ? ((plotBottom - top - valueZone) * d.value) / max : 0;
    const hl = isHighlight(s, d, i);
    out += `<rect x="${cx - barW / 2}" y="${plotBottom - h}" width="${barW}" height="${Math.max(h, 2)}" rx="4" fill="${hl ? T.barHi : T.barLo}"/>`;
    const label = formatValue(d.value, s.valueFormat);
    let vs = 32;
    while (vs > 18 && measure(label, { font: FONTS.monoMedium, size: vs }) > slot - 10) vs -= 2;
    if (measure(label, { font: FONTS.monoMedium, size: vs }) > slot - 10) issues.push(`chart value "${label}" too wide for ${n} bars`);
    out += textPath(label, { font: FONTS.monoMedium, size: vs, x: cx, y: plotBottom - h - 16, fill: hl ? (T.marker ? T.ink : T.figure) : T.body, anchor: 'middle' }).svg;
    const lf = fitText(d.label, { font: FONTS.sans, maxSize: 26, minSize: 18, maxWidth: slot - 8, maxLines: 2 });
    if (!lf.ok) issues.push(`chart label "${d.label}": too long for ${n} bars`);
    lf.lines.slice(0, 2).forEach((l, li) => {
      out += textPath(l, { font: FONTS.sans, size: lf.size, x: cx, y: plotBottom + 34 + li * (lf.size * 1.2), fill: hl ? T.ink : T.muted, anchor: 'middle' }).svg;
    });
  });
  return out;
}

function hbarChart(s, top, bottom, issues, T) {
  const data = s.data;
  const n = data.length;
  const rowH = Math.min(124, (bottom - top) / n);
  if (rowH < 80) issues.push(`hbar: ${n} rows leave only ${Math.round(rowH)}px per row`);
  const max = Math.max(...data.map((d) => d.value));
  let out = '';
  data.forEach((d, i) => {
    const y = top + i * rowH;
    const hl = isHighlight(s, d, i);
    const label = formatValue(d.value, s.valueFormat);
    const vw = measure(label, { font: FONTS.monoMedium, size: 32 });
    const lf = fitText(d.label, { font: FONTS.sans, maxSize: 32, minSize: 24, maxWidth: CW - vw - 32, maxLines: 1 });
    if (!lf.ok) issues.push(`hbar label "${d.label}": too long`);
    out += textPath(lf.lines[0], { font: FONTS.sans, size: lf.size, x: PAD, y: y + 32, fill: hl ? T.ink : T.body }).svg;
    out += textPath(label, { font: FONTS.monoMedium, size: 32, x: W - PAD, y: y + 32, fill: hl ? (T.marker ? T.ink : T.figure) : T.ink, anchor: 'end' }).svg;
    const bw = max > 0 ? (CW * d.value) / max : 0;
    out += `<rect x="${PAD}" y="${y + 50}" width="${CW}" height="16" rx="3" fill="${T.track}" stroke="${T.trackStroke}"/>`;
    out += `<rect x="${PAD}" y="${y + 50}" width="${Math.max(bw, 3)}" height="16" rx="3" fill="${hl ? T.barHi : T.barLo}"/>`;
  });
  return out;
}

function lineChart(s, top, bottom, issues, T) {
  const data = s.data;
  const vals = data.map((d) => d.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const tickLabels = ticks.map((t) => formatValue(t, { ...s.valueFormat, decimals: s.valueFormat?.tickDecimals ?? (hi - lo < 10 ? 1 : 0) }));
  const yLabelW = Math.max(...tickLabels.map((t) => measure(t, { font: FONTS.mono, size: 22 })));
  const left = PAD + yLabelW + 20;
  const right = W - PAD - 10;
  const plotTop = top + 40;
  const plotBottom = bottom - 60;
  const X = (i) => left + ((right - left) * i) / Math.max(data.length - 1, 1);
  const Y = (v) => plotBottom - ((plotBottom - plotTop) * (v - lo)) / (hi - lo || 1);
  const lineColor = T.name === 'dark' ? T.body : T.ink;
  let out = '';
  ticks.forEach((t, i) => {
    const y = Y(t);
    out += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${T.hair}" stroke-width="1.5"/>`;
    out += textPath(tickLabels[i], { font: FONTS.mono, size: 22, x: left - 16, y: y + 8, fill: T.faint, anchor: 'end' }).svg;
  });
  const pts = data.map((d, i) => [X(i), Y(d.value)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  out += `<path d="${line}L${pts[pts.length - 1][0].toFixed(1)} ${plotBottom}L${pts[0][0].toFixed(1)} ${plotBottom}Z" fill="${lineColor}" fill-opacity="0.06"/>`;
  out += `<path d="${line}" stroke="${lineColor}" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
  // x labels: always first and last, others only where they do not collide
  const boxes = [];
  const lastI = data.length - 1;
  const box = (i) => {
    const w = measure(data[i].label, { font: FONTS.mono, size: 22 });
    const anchor = i === 0 ? 'start' : i === lastI ? 'end' : 'middle';
    const x0 = anchor === 'start' ? X(i) - 6 : anchor === 'end' ? X(i) - w : X(i) - w / 2;
    return { i, anchor, x0, x1: x0 + w };
  };
  const lastBox = box(lastI);
  boxes.push(box(0));
  for (let i = 1; i < lastI; i++) {
    const b = box(i);
    if (b.x0 > boxes[boxes.length - 1].x1 + 28 && b.x1 < lastBox.x0 - 28) boxes.push(b);
  }
  if (lastI > 0) boxes.push(lastBox);
  for (const b of boxes) {
    out += textPath(data[b.i].label, { font: FONTS.mono, size: 22, x: b.anchor === 'start' ? X(b.i) - 6 : X(b.i), y: plotBottom + 40, fill: T.muted, anchor: b.anchor }).svg;
  }
  // highlight: explicit or last point
  let hi_i = data.findIndex((d, i) => isHighlight(s, d, i));
  if (hi_i < 0) hi_i = data.length - 1;
  data.forEach((d, i) => {
    if (i === hi_i) return;
    out += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="5" fill="${T.bg}" stroke="${lineColor}" stroke-width="3"/>`;
  });
  const [hx, hy] = pts[hi_i];
  if (T.marker) out += `<circle cx="${hx}" cy="${hy}" r="19" fill="${T.marker}"/>`;
  out += `<circle cx="${hx}" cy="${hy}" r="11" fill="${T.marker ? T.ink : T.figure}"/>`;
  const hv = formatValue(data[hi_i].value, s.valueFormat);
  const hvw = measure(hv, { font: FONTS.monoMedium, size: 36 });
  const anchor = hx + hvw / 2 > W - PAD ? 'end' : hx - hvw / 2 < left ? 'start' : 'middle';
  const lx = anchor === 'end' ? Math.min(hx + 10, W - PAD) : hx;
  const ly = hy - 30 < plotTop ? hy + 56 : hy - 32;
  out += textPath(hv, { font: FONTS.monoMedium, size: 36, x: lx, y: ly, fill: T.marker ? T.ink : T.figure, anchor }).svg;
  if (data.length > 24) issues.push('line chart: max 24 points');
  return out;
}

/** Title + mono unit line shared by chart/map/compare inner slides. Returns { svg, y }. */
function titleBlock(s, T, issues, y = CONTENT_TOP + 20) {
  let out = '';
  const tt = block(s.title, { font: FONTS.sansMedium, maxSize: 60, minSize: 44, maxLines: 2, tracking: -0.022, top: y, fill: T.ink, lineHeight: 1.1 }, issues, 'title');
  out += tt.svg;
  y += tt.height + 22;
  if (s.unit) {
    const u = ellipsize(String(s.unit).toUpperCase(), { font: FONTS.mono, size: 22, tracking: 0.08, maxWidth: CW });
    if (u !== String(s.unit).toUpperCase()) issues.push('unit: too long for one line');
    out += textPath(u, { font: FONTS.mono, size: 22, x: PAD, y: y + 22, fill: T.muted, tracking: 0.08 }).svg;
    y += 40;
  }
  return { svg: out, y };
}

/** Chart caption pinned above the footer. Returns { svg, bottom }. */
function captionBlock(s, T, issues) {
  if (!s.caption) return { svg: '', bottom: CONTENT_BOTTOM };
  const cf = fitText(s.caption, { font: FONTS.sans, maxSize: 28, minSize: 22, maxWidth: CW, maxLines: 2 });
  if (!cf.ok) issues.push('caption: does not fit 2 lines');
  const ch = (cf.lines.slice(0, 2).length - 1) * cf.size * 1.3 + cf.size;
  return {
    svg: textBlock(cf.lines.slice(0, 2), { font: FONTS.sans, size: cf.size, x: PAD, top: CONTENT_BOTTOM - ch, fill: T.muted, lineHeight: 1.3 }).svg,
    bottom: CONTENT_BOTTOM - ch - 28,
  };
}

function chart(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, counter(ctx));
  const tb = titleBlock(s, T, issues);
  out += tb.svg;
  const cap = captionBlock(s, T, issues);
  out += cap.svg;
  const top = tb.y + 56;
  const kind = s.kind || 'bar';
  if (kind === 'line') out += lineChart(s, top, cap.bottom, issues, T);
  else if (kind === 'hbar') out += hbarChart(s, top, cap.bottom, issues, T);
  else out += barChart(s, top, cap.bottom, issues, T);
  out += footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

// ── compare ──

/** Two big numbers side by side (or stacked when they are too wide). */
function compareBlock(s, T, top, bottom, issues) {
  const items = s.items || [];
  if (items.length !== 2) {
    issues.push('compare: exactly 2 items required');
    return { svg: '', height: 0 };
  }
  const gap = 72;
  const colW = (CW - gap) / 2;
  const fits = items.map((it) => fitText(String(it.value), { font: FONTS.monoMedium, maxSize: 200, minSize: 90, maxWidth: colW - 48, maxLines: 1, tracking: -0.045 }));
  let size = Math.min(...fits.map((f) => f.size));
  const side = s.stack !== true && fits.every((f) => f.ok) && size >= 104;
  let out = '';
  let y = top;
  if (side) {
    const labels = items.map((it) => (it.label ? fitText(String(it.label).toUpperCase(), { font: FONTS.monoMedium, maxSize: 24, minSize: 20, maxWidth: colW, maxLines: 2, tracking: 0.1 }) : null));
    labels.forEach((l, i) => l && !l.ok && issues.push(`items[${i}].label: does not fit 2 lines`));
    const labelH = Math.max(0, ...labels.map((l) => (l ? (Math.min(l.lines.length, 2) - 1) * l.size * 1.35 + l.size : 0)));
    const valTop = y + (labelH ? labelH + 30 : 0);
    let maxNote = 0;
    items.forEach((it, i) => {
      const x = PAD + i * (colW + gap);
      if (labels[i]) out += textBlock(labels[i].lines.slice(0, 2), { font: FONTS.monoMedium, size: labels[i].size, x, top: y, fill: T.muted, lineHeight: 1.35, tracking: 0.1 }).svg;
      out += figure(String(it.value), { size, x: x - size * 0.03, top: valTop, T, accent: Boolean(it.highlight), tracking: -0.045 }).svg;
      if (it.note) {
        const nb = block(it.note, { font: FONTS.sans, maxSize: 30, minSize: 24, maxLines: 3, maxWidth: colW, x, top: valTop + size * 0.86 + 26, fill: T.body, lineHeight: 1.3 }, issues, `items[${i}].note`);
        out += nb.svg;
        maxNote = Math.max(maxNote, nb.height + 26);
      }
    });
    const end = valTop + size * 0.86 + maxNote;
    // divider + "vs" badge
    const dx = PAD + colW + gap / 2;
    out += `<line x1="${dx}" y1="${y}" x2="${dx}" y2="${end}" stroke="${T.hair}" stroke-width="1.5"/>`;
    const vy = valTop + size * 0.43;
    out += `<circle cx="${dx}" cy="${vy}" r="26" fill="${T.bg}" stroke="${T.rule}" stroke-width="1.5"/>`;
    out += textPath('vs', { font: FONTS.monoMedium, size: 22, x: dx, y: vy + 7, fill: T.muted, anchor: 'middle' }).svg;
    y = end;
  } else {
    // stacked rows
    items.forEach((it, i) => {
      if (i) {
        y += 36;
        out += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${T.hair}" stroke-width="1.5"/>`;
        y += 40;
      }
      if (it.label) {
        const lb = block(String(it.label).toUpperCase(), { font: FONTS.monoMedium, maxSize: 24, minSize: 20, maxLines: 1, top: y, fill: T.muted, tracking: 0.1 }, issues, `items[${i}].label`);
        out += lb.svg;
        y += lb.height + 24;
      }
      const vf = fitText(String(it.value), { font: FONTS.monoMedium, maxSize: 170, minSize: 80, maxWidth: CW, maxLines: 1, tracking: -0.045 });
      if (!vf.ok) issues.push(`items[${i}].value: too wide`);
      out += figure(vf.lines[0], { size: vf.size, x: PAD - vf.size * 0.03, top: y, T, accent: Boolean(it.highlight), tracking: -0.045 }).svg;
      y += vf.size * 0.86;
      if (it.note) {
        y += 22;
        const nb = block(it.note, { font: FONTS.sans, maxSize: 30, minSize: 24, maxLines: 2, top: y, fill: T.body, lineHeight: 1.3 }, issues, `items[${i}].note`);
        out += nb.svg;
        y += nb.height;
      }
    });
  }
  if (s.verdict) {
    y += 52;
    const v = s.verdict;
    const vSize = 64;
    const vw = v.value ? measure(v.value, { font: FONTS.monoMedium, size: vSize, tracking: -0.03 }) : 0;
    const tx = PAD + 36 + (vw ? vw + 32 : 0);
    const f = fitText(v.text || '', { font: FONTS.sans, maxSize: 30, minSize: 24, maxWidth: W - PAD - 36 - tx, maxLines: 2 });
    if (v.text && !f.ok) issues.push('verdict.text: does not fit 2 lines');
    const th = v.text ? (Math.min(f.lines.length, 2) - 1) * f.size * 1.28 + f.size : 0;
    const ch = Math.max(vSize * 0.86, th) + 56;
    out += `<rect x="${PAD}" y="${y}" width="${CW}" height="${ch}" rx="14" fill="${T.card}" stroke="${T.cardStroke}" stroke-width="1.5"/>`;
    if (v.value) out += textPath(v.value, { font: FONTS.monoMedium, size: vSize, x: PAD + 36, y: y + ch / 2 + vSize * 0.36, fill: T.ink, tracking: -0.03 }).svg;
    if (v.text) out += textBlock(f.lines.slice(0, 2), { font: FONTS.sans, size: f.size, x: tx, top: y + (ch - th) / 2, fill: T.body, lineHeight: 1.28 }).svg;
    y += ch;
  }
  if (y > bottom) issues.push(`compare: content runs to y=${Math.round(y)} (limit ${Math.round(bottom)})`);
  return { svg: out, height: y - top };
}

function compare(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, counter(ctx));
  const tb = titleBlock(s, T, issues);
  const cap = captionBlock(s, T, issues);
  const top = tb.y + 80;
  const cb = compareBlock(s, T, top, cap.bottom, issues);
  out += tb.svg + cap.svg + centre(cb.svg, top + cb.height, cap.bottom - 60, 300) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

// ── map ──

/** Dot-grid land + value bubbles + labels, fitted into box. */
function mapBlock(s, T, box, issues) {
  const bbox = Array.isArray(s.bbox) ? s.bbox : REGIONS[s.region || 'world'];
  if (!bbox) {
    issues.push(`map: unknown region "${s.region}"`);
    return { svg: '' };
  }
  const proj = projection(bbox, box, { stdParallel: s.stdParallel ?? 28 });
  const spacing = s.dotSpacing || Math.max(9, Math.round(proj.width / 92));
  let out = landDots(proj, { spacing, radius: spacing * 0.3, fill: T.land });
  const pts = (s.points || []).map((p, i) => ({ ...p, i, hl: isHighlight(s, p, i) }));
  const maxV = Math.max(0, ...pts.map((p) => p.value || 0));
  const maxR = s.maxRadius || Math.min(proj.width, proj.height) * 0.2;
  for (const p of pts) {
    [p.x, p.y] = proj.xy(p.lon, p.lat);
    p.r = maxV > 0 ? Math.max(5, maxR * Math.sqrt((p.value || 0) / maxV)) : 6;
    if (p.x < proj.x0 - 2 || p.x > proj.x0 + proj.width + 2 || p.y < proj.y0 - 2 || p.y > proj.y0 + proj.height + 2) issues.push(`map: point "${p.label}" is outside the map area`);
  }
  [...pts].sort((a, b) => (a.hl - b.hl) || b.r - a.r).forEach((p) => {
    out += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${p.hl ? T.bubbleHi : T.bubble}" fill-opacity="${p.hl ? 0.92 : 0.82}" stroke="${T.bubbleStroke}" stroke-width="2"/>`;
  });
  // labels: biggest first, try right / left / below / above, skip on collision
  const nLabels = s.labels ?? 6;
  // obstacles: every bubble big enough to read (tiny dots may sit under a label)
  const placed = pts.filter((p) => p.r >= 8).map((p) => ({ x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, own: p.i }));
  const want = [...pts].filter((p) => p.showLabel !== false).sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, nLabels);
  for (const p of pts) if (p.showLabel === true && !want.includes(p)) want.push(p);
  for (const p of want) {
    const name = p.label;
    const val = p.valueLabel ?? formatValue(p.value, s.valueFormat);
    const nw = measure(name, { font: FONTS.sansMedium, size: 26 });
    const vw = measure(val, { font: FONTS.monoMedium, size: 24 });
    const w = Math.max(nw, vw);
    const h = 58;
    const big = p.r > 40 && w < p.r * 1.6; // label inside a very large bubble, centred
    const cands = big
      ? [{ x0: p.x - w / 2, y0: p.y - h / 2, align: 'middle', inside: true }]
      : [
          { x0: p.x + p.r + 12, y0: p.y - h / 2, align: 'start' },
          { x0: p.x - p.r - 12 - w, y0: p.y - h / 2, align: 'end' },
          { x0: p.x - w / 2, y0: p.y + p.r + 8, align: 'middle' },
          { x0: p.x - w / 2, y0: p.y - p.r - 8 - h, align: 'middle' },
          { x0: p.x + p.r * 0.75 + 8, y0: p.y - p.r * 0.75 - h, align: 'start' },
          { x0: p.x + p.r * 0.75 + 8, y0: p.y + p.r * 0.75, align: 'start' },
          { x0: p.x - p.r * 0.75 - 8 - w, y0: p.y - p.r * 0.75 - h, align: 'end' },
          { x0: p.x - p.r * 0.75 - 8 - w, y0: p.y + p.r * 0.75, align: 'end' },
        ];
    let ok = null;
    for (const c of cands) {
      const b = { x0: c.x0, x1: c.x0 + w, y0: c.y0, y1: c.y0 + h };
      if (b.x0 < PAD - 6 || b.x1 > W - PAD + 6 || b.y0 < box.y - 6 || b.y1 > box.y + box.h + 6) continue;
      const obstacles = c.inside ? placed.filter((q) => q.own === -1) : placed; // inside a big bubble only other labels count
      if (obstacles.some((q) => q.own !== p.i && !(b.x1 < q.x0 - 6 || b.x0 > q.x1 + 6 || b.y1 < q.y0 - 2 || b.y0 > q.y1 + 2))) continue;
      ok = { ...c, b };
      break;
    }
    if (!ok) {
      if (p.showLabel === true) issues.push(`map: no room for the label of "${p.label}"`);
      continue;
    }
    placed.push({ ...ok.b, own: -1 });
    const ax = ok.align === 'start' ? ok.b.x0 : ok.align === 'end' ? ok.b.x1 : ok.b.x0 + w / 2;
    const anchor = ok.align;
    const onBubble = ok.inside;
    const nameFill = onBubble ? (T.name === 'dark' ? C.void : T.bg) : T.ink;
    const valFill = onBubble ? nameFill : p.hl ? (T.marker ? T.ink : T.figure) : T.muted;
    // labels outside bubbles get a halo in the ground colour, so land dots never cut through them
    const halo = (svg) => (onBubble ? '' : svg.replace('<path ', `<path stroke="${T.bg}" stroke-width="9" stroke-linejoin="round" `));
    const n1 = textPath(name, { font: FONTS.sansMedium, size: 26, x: ax, y: ok.b.y0 + 24, fill: nameFill, anchor }).svg;
    const v1 = textPath(val, { font: FONTS.monoMedium, size: 24, x: ax, y: ok.b.y0 + 54, fill: valFill, anchor }).svg;
    out += halo(n1) + halo(v1) + n1 + v1;
  }
  return { svg: out, proj };
}

function mapSlide(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, counter(ctx));
  const tb = titleBlock(s, T, issues);
  const cap = captionBlock(s, T, issues);
  const box = { x: PAD, y: tb.y + 40, w: CW, h: cap.bottom - tb.y - 56 };
  out += tb.svg + cap.svg + mapBlock(s, T, box, issues).svg + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

// ── quote ──

function quote(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, counter(ctx));
  let body = '';
  let y = CONTENT_TOP + 30;
  if (s.label) {
    const lb = block(String(s.label).toUpperCase(), { font: FONTS.monoMedium, maxSize: 26, minSize: 20, maxLines: 2, top: y, fill: T.muted, tracking: 0.1, lineHeight: 1.4 }, issues, 'label');
    body += lb.svg;
    y += lb.height + 56;
  }
  const qb = richBlock(s.text, { font: FONTS.sansMedium, maxSize: 84, minSize: 50, maxLines: 6, top: y, fill: T.ink, T, lineHeight: 1.14, tracking: -0.022 }, issues, 'text');
  body += qb.svg;
  y += qb.height;
  if (s.attribution) {
    y += 56;
    body += `<line x1="${PAD}" y1="${y}" x2="${PAD + 72}" y2="${y}" stroke="${T.rule}" stroke-width="3"/>`;
    y += 30;
    const at = block(s.attribution, { font: FONTS.sans, maxSize: 30, minSize: 24, maxLines: 2, top: y, fill: T.muted, lineHeight: 1.3 }, issues, 'attribution');
    body += at.svg;
    y += at.height;
  }
  if (y > CONTENT_BOTTOM) issues.push(`quote: content runs to y=${Math.round(y)} (limit ${CONTENT_BOTTOM})`);
  out += centre(body, y, 1150, 160) + footer(s, ctx, T);
  return { svg: wrapSvg(out), issues };
}

// ── closing ──

function closing(s, ctx) {
  const issues = [];
  const T = themeOf(s, ctx);
  let out = background(T) + header(T, counter(ctx));
  out += logo(T, PAD, 330, 6).svg;
  let y = 372;
  out += textPath(SITE, { font: FONTS.sansMedium, size: 80, x: PAD - 4, y: y + 66, fill: T.ink, tracking: -0.03 }).svg;
  y += 66 + 40;
  const tag = s.text || 'Published colocation, GPU and power prices. Every figure sourced.';
  const tg = block(tag, { font: FONTS.sans, maxSize: 36, minSize: 30, maxLines: 2, top: y, fill: T.body, lineHeight: 1.3 }, issues, 'closing text');
  out += tg.svg;
  y += tg.height + 28;
  const cta = s.cta || 'Follow for daily data center market numbers.';
  const ct = block(cta, { font: FONTS.sans, maxSize: 30, minSize: 26, maxLines: 2, top: y, fill: T.muted, lineHeight: 1.3 }, issues, 'closing cta');
  out += ct.svg;
  y += ct.height;

  // method & sources card: one line per source / data hook, with its date
  const items = [];
  for (const d of ctx.def.dataHooks || []) items.push({ who: d.dataset, date: d.asOf, what: String(d.url || '').replace(/^https:\/\/(www\.)?/, '') });
  for (const n of ctx.def.sources || []) items.push({ who: n.publisher, date: n.date, what: n.title });
  const seen = new Set();
  const rows = items.filter((it) => {
    const k = `${it.who}|${it.date}|${it.what}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (rows.length > 6) issues.push(`closing: ${rows.length} sources — max 6 fit on the card`);
  const shown = rows.slice(0, 6);
  const innerW = CW - 56;
  const rowH = 74;
  const cardH = 28 + 20 + 26 + shown.length * rowH + 14;
  const cardTop = 1196 - cardH;
  if (cardTop < y + 36) issues.push('closing: text collides with the sources card — shorten text/cta or cite fewer sources');
  out += `<rect x="${PAD}" y="${cardTop}" width="${CW}" height="${cardH}" rx="12" fill="${T.card}" stroke="${T.cardStroke}" stroke-width="1.5"/>`;
  out += textPath('DATA & SOURCES', { font: FONTS.monoMedium, size: 20, x: PAD + 28, y: cardTop + 28 + 16, fill: T.faint, tracking: 0.14 }).svg;
  shown.forEach((it, i) => {
    const top = cardTop + 28 + 20 + 26 + i * rowH;
    const head = `${it.who}, ${fmtDate(it.date)}`;
    out += textPath(ellipsize(head, { font: FONTS.monoMedium, size: 22, maxWidth: innerW }), { font: FONTS.monoMedium, size: 22, x: PAD + 28, y: top + 20, fill: T.body }).svg;
    out += textPath(ellipsize(it.what, { font: FONTS.sans, size: 22, maxWidth: innerW }), { font: FONTS.sans, size: 22, x: PAD + 28, y: top + 52, fill: T.muted }).svg;
  });
  out += `<line x1="${PAD}" y1="1232" x2="${W - PAD}" y2="1232" stroke="${T.hair}" stroke-width="1.5"/>`;
  out += textPath('Full table + filters: coloprice.com (link in bio)', { font: FONTS.mono, size: 20, x: PAD, y: 1288, fill: T.muted }).svg;
  return { svg: wrapSvg(out), issues };
}

export const TEMPLATES = { cover, stat, list, chart, compare, map: mapSlide, quote, closing };

/** Build one slide. ctx = { index, total, def, refs, dateLabel } */
export function buildSlide(slide, ctx) {
  const t = TEMPLATES[slide.type];
  if (!t) return { svg: null, issues: [`unknown slide type "${slide.type}"`] };
  uid = 0;
  const themes = [slide.theme, ...(slide.tones || [])].filter(Boolean);
  const bad = themes.filter((n) => !THEMES[n]);
  const res = t(slide, ctx);
  if (bad.length) res.issues.push(`unknown theme(s): ${bad.join(', ')} (use ${Object.keys(THEMES).join(' | ')})`);
  return res;
}

export function slideContext(def) {
  const refs = {};
  for (const s of def.sources || []) refs[s.id] = { ...s, kind: 'news' };
  for (const d of def.dataHooks || []) refs[d.id] = { ...d, kind: 'data' };
  return { def, refs, total: (def.slides || []).length, dateLabel: fmtDate(def.created).toUpperCase() };
}
