// Media library (assets/library): licensed photos for slides and the sites.
// catalog.json is the source of truth: licence, author, attribution and where each photo may be used.
// Social slides may only use entries with uses.social === true (public domain, CC0, CC BY); CC BY-SA
// photos are for unmodified use on the sites.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LIBRARY_DIR = fileURLToPath(new URL('../../assets/library/', import.meta.url));
let cache = null;
export function libraryCatalog() {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(LIBRARY_DIR + 'catalog.json', 'utf8')); } catch { cache = { images: [] }; }
  cache.byId = new Map((cache.images || []).map((e) => [e.id, e]));
  return cache;
}

/** Resolve a library id for a slide: entry + base64 JPEG, or an error message. */
export function libraryImage(id, { social = true } = {}) {
  const e = libraryCatalog().byId.get(id);
  if (!e) return { ok: false, error: `image "${id}" is not in assets/library/catalog.json` };
  if (social && !e.uses?.social) return { ok: false, error: `image "${id}" is ${e.license?.name || 'not cleared'} — not cleared for social posts (uses.social=false)` };
  const path = LIBRARY_DIR + e.file;
  if (!existsSync(path)) return { ok: false, error: `image file missing: assets/library/${e.file}` };
  return { ok: true, entry: e, base64: readFileSync(path).toString('base64') };
}
