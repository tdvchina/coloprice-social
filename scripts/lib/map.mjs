// Dot-grid maps: equirectangular projection + Natural Earth 1:110m land mask (public domain,
// vendored in assets/geo/, see LICENSE.md there). No tiles, no network, no copyrighted basemap.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const GEO = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/geo/ne_110m_land.json');
let LAND = null;
function land() {
  if (!LAND) {
    const { polygons } = JSON.parse(readFileSync(GEO, 'utf8'));
    LAND = polygons.map((rings) => {
      let w = 180, e = -180, s = 90, n = -90;
      for (const [x, y] of rings[0]) (w = Math.min(w, x)), (e = Math.max(e, x)), (s = Math.min(s, y)), (n = Math.max(n, y));
      return { rings, w, e, s, n };
    });
  }
  return LAND;
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function isLand(lon, lat) {
  for (const p of land()) {
    if (lon < p.w || lon > p.e || lat < p.s || lat > p.n) continue;
    if (!inRing(lon, lat, p.rings[0])) continue;
    if (p.rings.slice(1).some((h) => inRing(lon, lat, h))) continue;
    return true;
  }
  return false;
}

// Named regions: [west, south, east, north] in degrees.
export const REGIONS = {
  world: [-170, -56, 180, 76],
  'world-pacific': [-25, -50, 335, 72],
  europe: [-12, 34, 34, 66],
  asia: [60, -12, 150, 50],
  apac: [65, -45, 180, 50],
  'north-america': [-128, 14, -60, 56],
  'latin-america': [-118, -56, -30, 33],
  'middle-east': [25, 10, 65, 42],
};

/**
 * Equirectangular projection fitted into a box. stdParallel stretches the map vertically
 * (x is scaled by cos(stdParallel)), which suits a portrait slide.
 */
export function projection(bbox, box, { stdParallel = 0 } = {}) {
  const [w, s, e, n] = bbox;
  const c = Math.cos((stdParallel * Math.PI) / 180);
  const spanX = (e - w) * c;
  const spanY = n - s;
  const k = Math.min(box.w / spanX, box.h / spanY);
  const mw = spanX * k;
  const mh = spanY * k;
  const ox = box.x + (box.w - mw) / 2;
  const oy = box.y + (box.h - mh) / 2;
  const wrap = (lon) => (lon < w ? lon + 360 : lon > e ? lon - 360 : lon); // 'world-pacific' crosses 180
  return {
    k, width: mw, height: mh, x0: ox, y0: oy,
    xy: (lon, lat) => [ox + (wrap(lon) - w) * c * k, oy + (n - lat) * k],
    lonlat: (x, y) => [w + (x - ox) / (c * k), n - (y - oy) / k],
  };
}

/** Dots on land inside the projected box. Returns SVG (one path of tiny squares-as-circles). */
export function landDots(proj, { spacing = 11, radius = 3.4, fill, opacity = 1 } = {}) {
  let d = '';
  const r = radius;
  for (let y = proj.y0 + spacing / 2; y < proj.y0 + proj.height; y += spacing) {
    for (let x = proj.x0 + spacing / 2; x < proj.x0 + proj.width; x += spacing) {
      let [lon, lat] = proj.lonlat(x, y);
      if (lon > 180) lon -= 360;
      if (!isLand(lon, lat)) continue;
      // circle as two arcs — far fewer bytes than <circle> elements
      d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
  }
  return `<path d="${d}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}/>`;
}
