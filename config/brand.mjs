// Coloprice brand tokens for slides — mirrors colocationindex/DESIGN.md.
// ONE chromatic accent (acid lime) — only for key figures / highlighted rows.
export const COLORS = {
  void: '#08090a', // canvas
  carbon: '#0f1011', // cards
  obsidian: '#161718',
  graphite: '#23252a', // hairline borders
  smoke: '#383b3f',
  ash: '#62666d', // muted text-3
  fog: '#8a8f98', // secondary text
  mist: '#d0d6e0', // body text
  bone: '#e5e5e6',
  paper: '#ffffff', // headlines
  lime: '#e4f222', // THE accent
  green: '#27a644', // positive delta
  red: '#eb5757', // negative delta
};

export const SLIDE = { W: 1080, H: 1350, PAD: 80 };

// Logo = three bars (grey, light grey, lime) — from public/favicon.svg of coloprice.com
// (viewBox 32: bars x=7/14/21, w=4, h=11/16/20, bottom at y=25).
export const LOGO_BARS = [
  { x: 0, w: 4, h: 11, fill: COLORS.fog },
  { x: 7, w: 4, h: 16, fill: COLORS.mist },
  { x: 14, w: 4, h: 20, fill: COLORS.lime },
];

export const SITE = 'coloprice.com';

// ── Themes ────────────────────────────────────────────────────────────────
// Three grounds, one brand. Lime stays THE accent: on dark it is the key figure,
// on paper it is only a highlighter marker (never lime text on a light ground),
// and the lime ground is the rare accent tile (void ink on lime).
// Every template reads colours from a theme, never from COLORS directly.
const mix = (a, b, t) => {
  // a over b at opacity t, as an opaque hex (librsvg-safe, no alpha stacking surprises)
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [A, B] = [p(a), p(b)];
  return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};
export const PAPER_GROUND = '#f3f4f1';

export const THEMES = {
  dark: {
    name: 'dark',
    bg: COLORS.void, grid: COLORS.graphite, gridOpacity: 0.7,
    ink: COLORS.paper, body: COLORS.mist, muted: COLORS.fog, faint: COLORS.ash,
    hair: COLORS.graphite, rule: COLORS.smoke,
    card: COLORS.carbon, cardStroke: COLORS.graphite,
    figure: COLORS.lime, figureAlt: COLORS.paper, marker: null, onMarker: COLORS.void,
    hlMode: 'color', hlText: COLORS.lime, hlFill: null,
    barHi: COLORS.lime, barLo: COLORS.ash, track: COLORS.carbon, trackStroke: COLORS.graphite,
    up: COLORS.green, down: COLORS.red, flat: COLORS.fog,
    pill: COLORS.carbon, pillStroke: COLORS.graphite, pillText: COLORS.mist, pillDot: COLORS.lime,
    land: '#2a2d33', bubble: COLORS.mist, bubbleHi: COLORS.lime, bubbleStroke: COLORS.void,
    logo: 'bars', swipe: COLORS.mist,
  },
  paper: {
    name: 'paper',
    bg: PAPER_GROUND, grid: '#e2e4dd', gridOpacity: 1,
    ink: COLORS.void, body: '#2c2f34', muted: '#5c6068', faint: '#868b93',
    hair: '#d6d9d1', rule: '#b4b8af',
    card: '#ffffff', cardStroke: '#d9dcd4',
    figure: COLORS.void, figureAlt: COLORS.void, marker: COLORS.lime, onMarker: COLORS.void,
    hlMode: 'marker', hlText: COLORS.void, hlFill: COLORS.lime,
    barHi: COLORS.void, barLo: '#bfc3ba', track: '#e5e7e1', trackStroke: '#d6d9d1',
    up: '#1e8636', down: '#cf3f3f', flat: '#5c6068',
    pill: COLORS.void, pillStroke: COLORS.void, pillText: COLORS.paper, pillDot: COLORS.lime,
    land: '#d3d6ce', bubble: '#3a3d43', bubbleHi: COLORS.void, bubbleStroke: PAPER_GROUND,
    logo: 'badge', swipe: COLORS.void,
  },
  lime: {
    name: 'lime',
    bg: COLORS.lime, grid: mix(COLORS.void, COLORS.lime, 0.1), gridOpacity: 1,
    ink: COLORS.void, body: mix(COLORS.void, COLORS.lime, 0.84), muted: mix(COLORS.void, COLORS.lime, 0.64), faint: mix(COLORS.void, COLORS.lime, 0.46),
    hair: mix(COLORS.void, COLORS.lime, 0.2), rule: mix(COLORS.void, COLORS.lime, 0.36),
    card: mix(COLORS.void, COLORS.lime, 0.06), cardStroke: mix(COLORS.void, COLORS.lime, 0.2),
    figure: COLORS.void, figureAlt: COLORS.void, marker: null, onMarker: COLORS.lime,
    hlMode: 'marker', hlText: COLORS.lime, hlFill: COLORS.void,
    barHi: COLORS.void, barLo: mix(COLORS.void, COLORS.lime, 0.3), track: mix(COLORS.void, COLORS.lime, 0.08), trackStroke: mix(COLORS.void, COLORS.lime, 0.2),
    up: COLORS.void, down: COLORS.void, flat: mix(COLORS.void, COLORS.lime, 0.64),
    pill: COLORS.void, pillStroke: COLORS.void, pillText: COLORS.lime, pillDot: COLORS.lime,
    land: mix(COLORS.void, COLORS.lime, 0.16), bubble: mix(COLORS.void, COLORS.lime, 0.55), bubbleHi: COLORS.void, bubbleStroke: COLORS.lime,
    logo: 'badge', swipe: COLORS.void,
  },
};
export const THEME_NAMES = Object.keys(THEMES);
