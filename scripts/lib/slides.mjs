// Slide templates (Coloprice style, DESIGN.md): cover · stat · list · chart · closing.
// Every template returns { svg, issues } — issues are layout overflows that the
// validator turns into hard errors (no clipped text ever reaches Instagram).
import { COLORS as C, SLIDE, LOGO_BARS, SITE } from '../../config/brand.mjs';
import { FONTS, fitText, textPath, textBlock, measure, ellipsize } from './text.mjs';

const { W, H, PAD } = SLIDE;
const CW = W - PAD * 2; // content width 920
const CONTENT_TOP = 210;
const CONTENT_BOTTOM = 1196; // nothing below this except the footer
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

// ── shared chrome ─────────────────────────────────────────────────────────

function logo(x, bottom, scale) {
  return LOGO_BARS.map(
    (b) =>
      `<rect x="${x + b.x * scale}" y="${bottom - b.h * scale}" width="${b.w * scale}" height="${b.h * scale}" fill="${b.fill}"/>`,
  ).join('');
}

function background() {
  let grid = '';
  for (let x = 120; x < W; x += 120) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  for (let y = 120; y < H; y += 120) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
  return `<defs>
    <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="gridMask"><rect width="${W}" height="${H}" fill="url(#gridFade)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.void}"/>
  <g stroke="${C.graphite}" stroke-width="1" mask="url(#gridMask)" opacity="0.7">${grid}</g>`;
}

function header(ctx, rightText) {
  const base = 122;
  const word = textPath('Coloprice', { font: FONTS.sansMedium, size: 36, x: PAD + 18 * 3 + 20, y: base - 2, fill: C.paper, tracking: -0.02 });
  const right = rightText
    ? textPath(rightText, { font: FONTS.mono, size: 24, x: W - PAD, y: base - 4, fill: C.fog, anchor: 'end', tracking: 0.04 }).svg
    : '';
  return `${logo(PAD, base, 3)}${word.svg}${right}
  <line x1="${PAD}" y1="160" x2="${W - PAD}" y2="160" stroke="${C.graphite}" stroke-width="1.5"/>`;
}

function footer(slide, ctx) {
  const site = textPath(SITE, { font: FONTS.sansMedium, size: 26, x: PAD, y: 1290, fill: C.mist });
  const label = refLabel(slide.refs, ctx);
  let src = '';
  if (label) {
    const maxWidth = CW - site.width - 48;
    const one = { font: FONTS.mono, size: 20, maxWidth };
    if (measure(label, one) <= maxWidth) {
      src = textPath(label, { font: FONTS.mono, size: 20, x: W - PAD, y: 1288, fill: C.fog, anchor: 'end' }).svg;
    } else {
      // two right-aligned lines: split at " · " when possible, else word-wrap
      const parts = label.split(' · ');
      let lines = parts.length > 1 ? [parts.slice(0, -1).join(' · ') + ' ·', parts[parts.length - 1]] : null;
      const fitsAll = (ls) => ls && ls.every((l) => measure(l, { font: FONTS.mono, size: 18 }) <= maxWidth);
      if (!fitsAll(lines)) lines = (fitText(label, { font: FONTS.mono, maxSize: 18, minSize: 18, maxWidth, maxLines: 2 }).lines || []).slice(0, 2);
      lines = lines.map((l) => ellipsize(l, { font: FONTS.mono, size: 18, maxWidth }));
      src = lines.map((l, i) => textPath(l, { font: FONTS.mono, size: 18, x: W - PAD, y: 1276 + i * 26, fill: C.fog, anchor: 'end' }).svg).join('');
    }
  }
  return `<line x1="${PAD}" y1="1232" x2="${W - PAD}" y2="1232" stroke="${C.graphite}" stroke-width="1.5"/>${site.svg}${src}`;
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

/** Fit + draw a text block, recording an issue if it overflows. Returns { svg, height }. */
function block(text, opts, issues, what) {
  const { font, maxSize, minSize, maxLines, maxWidth = CW, tracking = 0, x = PAD, top, fill, lineHeight = 1.2 } = opts;
  const fit = fitText(text, { font, maxSize, minSize, maxWidth, maxLines, tracking });
  if (!fit.ok) issues.push(`${what}: does not fit ${maxLines} line(s) even at ${minSize}px — shorten it`);
  const b = textBlock(fit.lines.slice(0, maxLines), { font, size: fit.size, x, top, lineHeight, fill, tracking });
  return { ...b, size: fit.size };
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

function deltaColor(dir) {
  return dir === 'down' ? C.red : dir === 'up' ? C.green : C.fog;
}

function deltaPill(delta, x, top) {
  const color = deltaColor(delta.dir);
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

// ── templates ─────────────────────────────────────────────────────────────

function cover(s, ctx) {
  const issues = [];
  const chrome = background() + header(ctx, ctx.dateLabel || '');
  let out = '';
  let y = CONTENT_TOP + 24;

  if (s.kicker) {
    const text = String(s.kicker).toUpperCase();
    const tw = measure(text, { font: FONTS.monoMedium, size: 22, tracking: 0.12 });
    const w = 22 + 12 + 16 + tw + 26;
    if (w > CW) issues.push('kicker: too long');
    out += `<rect x="${PAD}" y="${y}" width="${w}" height="52" rx="26" fill="${C.carbon}" stroke="${C.graphite}" stroke-width="1.5"/>
      <circle cx="${PAD + 22 + 6}" cy="${y + 26}" r="6" fill="${C.lime}"/>`;
    out += textPath(text, { font: FONTS.monoMedium, size: 22, x: PAD + 22 + 12 + 16, y: y + 34, fill: C.mist, tracking: 0.12 }).svg;
    y += 52 + 48;
  }

  const hl = block(s.headline, { font: FONTS.sansMedium, maxSize: 92, minSize: 60, maxLines: 2, tracking: -0.022, top: y, fill: C.paper, lineHeight: 1.08 }, issues, 'headline');
  out += hl.svg;
  y += hl.height + 72;

  if (s.figure) {
    const vf = fitText(s.figure.value, { font: FONTS.monoMedium, maxSize: 240, minSize: 110, maxWidth: CW, maxLines: 1, tracking: -0.04 });
    if (!vf.ok) issues.push('figure.value: too wide even at 110px');
    out += textBlock(vf.lines.slice(0, 1), { font: FONTS.monoMedium, size: vf.size, x: PAD - vf.size * 0.03, top: y, fill: C.lime, tracking: -0.04 }).svg;
    y += vf.size * 0.86 + 34;
    if (s.figure.label) {
      const lb = block(s.figure.label, { font: FONTS.sans, maxSize: 38, minSize: 30, maxLines: 2, top: y, fill: C.mist, lineHeight: 1.3 }, issues, 'figure.label');
      out += lb.svg;
      y += lb.height + 40;
    }
  }

  if (s.deck) {
    y += 8;
    const dk = block(s.deck, { font: FONTS.sans, maxSize: 34, minSize: 28, maxLines: 3, top: y, fill: C.fog, lineHeight: 1.35 }, issues, 'deck');
    out += dk.svg;
    y += dk.height;
  }
  if (y > 1130) issues.push(`cover: content runs to y=${Math.round(y)} (limit 1130) — drop the deck or shorten the headline`);
  out = chrome + centre(out, y, 1110, 90);

  // swipe cue
  const sw = textPath('SWIPE', { font: FONTS.monoMedium, size: 22, x: W - PAD - 64, y: 1192, fill: C.fog, anchor: 'end', tracking: 0.16 });
  out += sw.svg + arrow(W - PAD - 48, 1184, 48, C.mist);
  out += footer(s, ctx);
  return { svg: wrapSvg(out), issues };
}

function stat(s, ctx) {
  const issues = [];
  const chrome = background() + header(ctx, counter(ctx));
  let out = '';
  let y = CONTENT_TOP + 30;

  if (s.label) {
    const lb = block(String(s.label).toUpperCase(), { font: FONTS.monoMedium, maxSize: 26, minSize: 20, maxLines: 2, top: y, fill: C.fog, tracking: 0.1, lineHeight: 1.4 }, issues, 'label');
    out += lb.svg;
    y += lb.height + 56;
  }

  const vf = fitText(s.value, { font: FONTS.monoMedium, maxSize: 250, minSize: 100, maxWidth: CW, maxLines: 1, tracking: -0.04 });
  if (!vf.ok) issues.push('value: too wide even at 100px');
  out += textBlock(vf.lines.slice(0, 1), { font: FONTS.monoMedium, size: vf.size, x: PAD - vf.size * 0.03, top: y, fill: s.accent === false ? C.paper : C.lime, tracking: -0.04 }).svg;
  y += vf.size * 0.86 + 36;

  if (s.unit) {
    const un = block(s.unit, { font: FONTS.sans, maxSize: 40, minSize: 30, maxLines: 2, top: y, fill: C.mist, lineHeight: 1.25 }, issues, 'unit');
    out += un.svg;
    y += un.height + 36;
  }
  if (s.delta) {
    const dp = deltaPill(s.delta, PAD, y);
    out += dp.svg;
    y += dp.height + 24;
  }
  if (s.context) {
    y += 40;
    out += `<line x1="${PAD}" y1="${y - 28}" x2="${PAD + 72}" y2="${y - 28}" stroke="${C.smoke}" stroke-width="3"/>`;
    const cx = block(s.context, { font: FONTS.sans, maxSize: 40, minSize: 30, maxLines: 6, top: y, fill: C.mist, lineHeight: 1.36 }, issues, 'context');
    out += cx.svg;
    y += cx.height;
  }
  if (y > CONTENT_BOTTOM) issues.push(`stat: content runs to y=${Math.round(y)} (limit ${CONTENT_BOTTOM}) — shorten context`);
  out = chrome + centre(out, y, 1150, 130) + footer(s, ctx);
  return { svg: wrapSvg(out), issues };
}

function list(s, ctx) {
  const issues = [];
  let out = background() + header(ctx, counter(ctx));
  let y = CONTENT_TOP + 20;
  const tt = block(s.title, { font: FONTS.sansMedium, maxSize: 64, minSize: 44, maxLines: 2, tracking: -0.022, top: y, fill: C.paper, lineHeight: 1.1 }, issues, 'title');
  out += tt.svg;
  y += tt.height + 22;
  if (s.unit) {
    out += textPath(String(s.unit).toUpperCase(), { font: FONTS.mono, size: 22, x: PAD, y: y + 22, fill: C.fog, tracking: 0.08 }).svg;
    y += 40;
  }
  y += 28;

  const rows = s.rows || [];
  const bottom = s.footnote ? CONTENT_BOTTOM - 50 : CONTENT_BOTTOM;
  const rowH = Math.min(164, Math.floor((bottom - y) / Math.max(rows.length, 1)));
  if (rowH < 96) issues.push(`list: ${rows.length} rows leave only ${rowH}px per row — use fewer rows or a shorter title`);
  rows.forEach((r, i) => {
    const top = y + i * rowH;
    const mid = top + rowH / 2;
    const hasSub = Boolean(r.note || r.delta);
    out += `<line x1="${PAD}" y1="${top}" x2="${W - PAD}" y2="${top}" stroke="${C.graphite}" stroke-width="1.5"/>`;
    const rankColor = r.highlight ? C.lime : C.ash;
    out += textPath(String(i + 1).padStart(2, '0'), { font: FONTS.monoMedium, size: 26, x: PAD, y: mid + 9, fill: rankColor }).svg;

    const vSize = 46;
    const vw = measure(r.value, { font: FONTS.monoMedium, size: vSize });
    const valueY = hasSub ? mid + 2 : mid + 16;
    out += textPath(r.value, { font: FONTS.monoMedium, size: vSize, x: W - PAD, y: valueY, fill: r.highlight ? C.lime : C.paper, anchor: 'end' }).svg;
    if (r.delta) {
      out += textPath(r.delta.value, { font: FONTS.monoMedium, size: 24, x: W - PAD, y: valueY + 38, fill: deltaColor(r.delta.dir), anchor: 'end' }).svg;
    }

    const labelX = PAD + 76;
    const deltaW = r.delta ? measure(r.delta.value, { font: FONTS.monoMedium, size: 24 }) : 0;
    const labelMax = W - PAD - Math.max(vw, 0) - 36 - labelX;
    const lf = fitText(r.label, { font: FONTS.sans, maxSize: 38, minSize: 28, maxWidth: labelMax, maxLines: 1 });
    if (!lf.ok) issues.push(`rows[${i}].label "${r.label}": too long for the row`);
    const labelY = r.note ? mid - 4 : mid + 13;
    out += textPath(lf.lines[0], { font: FONTS.sans, size: lf.size, x: labelX, y: labelY, fill: C.mist }).svg;
    if (r.note) {
      const noteMax = W - PAD - Math.max(deltaW, 0) - 36 - labelX;
      const note = ellipsize(r.note, { font: FONTS.sans, size: 24, maxWidth: noteMax });
      if (note !== r.note) issues.push(`rows[${i}].note: truncated — shorten it`);
      out += textPath(note, { font: FONTS.sans, size: 24, x: labelX, y: mid + 34, fill: C.fog }).svg;
    }
  });
  const end = y + rows.length * rowH;
  out += `<line x1="${PAD}" y1="${end}" x2="${W - PAD}" y2="${end}" stroke="${C.graphite}" stroke-width="1.5"/>`;
  if (s.footnote) {
    const fn = block(s.footnote, { font: FONTS.sans, maxSize: 24, minSize: 20, maxLines: 2, top: end + 18, fill: C.fog, lineHeight: 1.3 }, issues, 'footnote');
    out += fn.svg;
  }
  out += footer(s, ctx);
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

function barChart(s, top, bottom, issues) {
  const data = s.data;
  const n = data.length;
  const slot = CW / n;
  const barW = Math.min(slot * 0.58, 120);
  const labelZone = 84;
  const plotBottom = bottom - labelZone;
  const valueZone = 56;
  const max = Math.max(...data.map((d) => d.value));
  let out = `<line x1="${PAD}" y1="${plotBottom}" x2="${W - PAD}" y2="${plotBottom}" stroke="${C.smoke}" stroke-width="2"/>`;
  data.forEach((d, i) => {
    const cx = PAD + slot * i + slot / 2;
    const h = max > 0 ? ((plotBottom - top - valueZone) * d.value) / max : 0;
    const hl = isHighlight(s, d, i);
    out += `<rect x="${cx - barW / 2}" y="${plotBottom - h}" width="${barW}" height="${Math.max(h, 2)}" rx="4" fill="${hl ? C.lime : C.ash}"/>`;
    const label = formatValue(d.value, s.valueFormat);
    let vs = 32;
    while (vs > 18 && measure(label, { font: FONTS.monoMedium, size: vs }) > slot - 10) vs -= 2;
    if (measure(label, { font: FONTS.monoMedium, size: vs }) > slot - 10) issues.push(`chart value "${label}" too wide for ${n} bars`);
    out += textPath(label, { font: FONTS.monoMedium, size: vs, x: cx, y: plotBottom - h - 16, fill: hl ? C.lime : C.mist, anchor: 'middle' }).svg;
    const lf = fitText(d.label, { font: FONTS.sans, maxSize: 26, minSize: 18, maxWidth: slot - 8, maxLines: 2 });
    if (!lf.ok) issues.push(`chart label "${d.label}": too long for ${n} bars`);
    lf.lines.slice(0, 2).forEach((l, li) => {
      out += textPath(l, { font: FONTS.sans, size: lf.size, x: cx, y: plotBottom + 34 + li * (lf.size * 1.2), fill: hl ? C.paper : C.fog, anchor: 'middle' }).svg;
    });
  });
  return out;
}

function hbarChart(s, top, bottom, issues) {
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
    out += textPath(lf.lines[0], { font: FONTS.sans, size: lf.size, x: PAD, y: y + 32, fill: hl ? C.paper : C.mist }).svg;
    out += textPath(label, { font: FONTS.monoMedium, size: 32, x: W - PAD, y: y + 32, fill: hl ? C.lime : C.paper, anchor: 'end' }).svg;
    const bw = max > 0 ? (CW * d.value) / max : 0;
    out += `<rect x="${PAD}" y="${y + 50}" width="${CW}" height="16" rx="3" fill="${C.carbon}" stroke="${C.graphite}"/>`;
    out += `<rect x="${PAD}" y="${y + 50}" width="${Math.max(bw, 3)}" height="16" rx="3" fill="${hl ? C.lime : C.ash}"/>`;
  });
  return out;
}

function lineChart(s, top, bottom, issues) {
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
  let out = '';
  ticks.forEach((t, i) => {
    const y = Y(t);
    out += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.graphite}" stroke-width="1.5"/>`;
    out += textPath(tickLabels[i], { font: FONTS.mono, size: 22, x: left - 16, y: y + 8, fill: C.ash, anchor: 'end' }).svg;
  });
  const pts = data.map((d, i) => [X(i), Y(d.value)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  out += `<path d="${line}L${pts[pts.length - 1][0].toFixed(1)} ${plotBottom}L${pts[0][0].toFixed(1)} ${plotBottom}Z" fill="${C.mist}" fill-opacity="0.06"/>`;
  out += `<path d="${line}" stroke="${C.mist}" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
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
    out += textPath(data[b.i].label, { font: FONTS.mono, size: 22, x: b.anchor === 'start' ? X(b.i) - 6 : X(b.i), y: plotBottom + 40, fill: C.fog, anchor: b.anchor }).svg;
  }
  // highlight: explicit or last point
  let hi_i = data.findIndex((d, i) => isHighlight(s, d, i));
  if (hi_i < 0) hi_i = data.length - 1;
  data.forEach((d, i) => {
    if (i === hi_i) return;
    out += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="5" fill="${C.void}" stroke="${C.mist}" stroke-width="3"/>`;
  });
  const [hx, hy] = pts[hi_i];
  out += `<circle cx="${hx}" cy="${hy}" r="11" fill="${C.lime}"/>`;
  const hv = formatValue(data[hi_i].value, s.valueFormat);
  const hvw = measure(hv, { font: FONTS.monoMedium, size: 36 });
  const anchor = hx + hvw / 2 > W - PAD ? 'end' : hx - hvw / 2 < left ? 'start' : 'middle';
  const lx = anchor === 'end' ? Math.min(hx + 10, W - PAD) : hx;
  const ly = hy - 30 < plotTop ? hy + 56 : hy - 28;
  out += textPath(hv, { font: FONTS.monoMedium, size: 36, x: lx, y: ly, fill: C.lime, anchor }).svg;
  if (data.length > 24) issues.push('line chart: max 24 points');
  return out;
}

function chart(s, ctx) {
  const issues = [];
  let out = background() + header(ctx, counter(ctx));
  let y = CONTENT_TOP + 20;
  const tt = block(s.title, { font: FONTS.sansMedium, maxSize: 60, minSize: 44, maxLines: 2, tracking: -0.022, top: y, fill: C.paper, lineHeight: 1.1 }, issues, 'title');
  out += tt.svg;
  y += tt.height + 22;
  if (s.unit) {
    out += textPath(String(s.unit).toUpperCase(), { font: FONTS.mono, size: 22, x: PAD, y: y + 22, fill: C.fog, tracking: 0.08 }).svg;
    y += 40;
  }
  let bottom = CONTENT_BOTTOM;
  if (s.caption) {
    const cf = fitText(s.caption, { font: FONTS.sans, maxSize: 28, minSize: 22, maxWidth: CW, maxLines: 2 });
    if (!cf.ok) issues.push('caption: does not fit 2 lines');
    const ch = (cf.lines.slice(0, 2).length - 1) * cf.size * 1.3 + cf.size;
    bottom = CONTENT_BOTTOM - ch - 28;
    out += textBlock(cf.lines.slice(0, 2), { font: FONTS.sans, size: cf.size, x: PAD, top: CONTENT_BOTTOM - ch, fill: C.fog, lineHeight: 1.3 }).svg;
  }
  const top = y + 56;
  const kind = s.kind || 'bar';
  if (kind === 'line') out += lineChart(s, top, bottom, issues);
  else if (kind === 'hbar') out += hbarChart(s, top, bottom, issues);
  else out += barChart(s, top, bottom, issues);
  out += footer(s, ctx);
  return { svg: wrapSvg(out), issues };
}

function closing(s, ctx) {
  const issues = [];
  let out = background() + header(ctx, counter(ctx));
  out += logo(PAD, 330, 6);
  let y = 372;
  out += textPath(SITE, { font: FONTS.sansMedium, size: 80, x: PAD - 4, y: y + 66, fill: C.paper, tracking: -0.03 }).svg;
  y += 66 + 40;
  const tag = s.text || 'Published colocation, GPU and power prices. Every figure sourced.';
  const tg = block(tag, { font: FONTS.sans, maxSize: 36, minSize: 30, maxLines: 2, top: y, fill: C.mist, lineHeight: 1.3 }, issues, 'closing text');
  out += tg.svg;
  y += tg.height + 28;
  const cta = s.cta || 'Follow for daily data center market numbers.';
  const ct = block(cta, { font: FONTS.sans, maxSize: 30, minSize: 26, maxLines: 2, top: y, fill: C.fog, lineHeight: 1.3 }, issues, 'closing cta');
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
  out += `<rect x="${PAD}" y="${cardTop}" width="${CW}" height="${cardH}" rx="12" fill="${C.carbon}" stroke="${C.graphite}" stroke-width="1.5"/>`;
  out += textPath('DATA & SOURCES', { font: FONTS.monoMedium, size: 20, x: PAD + 28, y: cardTop + 28 + 16, fill: C.ash, tracking: 0.14 }).svg;
  shown.forEach((it, i) => {
    const top = cardTop + 28 + 20 + 26 + i * rowH;
    const head = `${it.who}, ${fmtDate(it.date)}`;
    out += textPath(ellipsize(head, { font: FONTS.monoMedium, size: 22, maxWidth: innerW }), { font: FONTS.monoMedium, size: 22, x: PAD + 28, y: top + 20, fill: C.mist }).svg;
    out += textPath(ellipsize(it.what, { font: FONTS.sans, size: 22, maxWidth: innerW }), { font: FONTS.sans, size: 22, x: PAD + 28, y: top + 52, fill: C.fog }).svg;
  });
  out += `<line x1="${PAD}" y1="1232" x2="${W - PAD}" y2="1232" stroke="${C.graphite}" stroke-width="1.5"/>`;
  out += textPath('Full table + filters: coloprice.com (link in bio)', { font: FONTS.mono, size: 20, x: PAD, y: 1288, fill: C.fog }).svg;
  return { svg: wrapSvg(out), issues };
}

export const TEMPLATES = { cover, stat, list, chart, closing };

/** Build one slide. ctx = { index, total, def, refs, dateLabel } */
export function buildSlide(slide, ctx) {
  const t = TEMPLATES[slide.type];
  if (!t) return { svg: null, issues: [`unknown slide type "${slide.type}"`] };
  return t(slide, ctx);
}

export function slideContext(def) {
  const refs = {};
  for (const s of def.sources || []) refs[s.id] = { ...s, kind: 'news' };
  for (const d of def.dataHooks || []) refs[d.id] = { ...d, kind: 'data' };
  return { def, refs, total: (def.slides || []).length, dateLabel: fmtDate(def.created).toUpperCase() };
}
