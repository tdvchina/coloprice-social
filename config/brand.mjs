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
