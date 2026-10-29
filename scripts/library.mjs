#!/usr/bin/env node
// Media library tool (assets/library). Licensed photos of data centers, grid, energy and land for
// Coloprice posts and the dc-network sites.
//
//   node scripts/library.mjs build                 merge assets/library/_staging/*.json into catalog.json and validate
//   node scripts/library.mjs check                 validate catalog.json only (exit 1 on any problem)
//   node scripts/library.mjs find [--subject=transmission] [--country=usa] [--operator="Equinix"]
//                                 [--facility=<slug>] [--social] [--text=word]      list matching ids
//   node scripts/library.mjs sheet [same filters] [--out=out/library-sheet.jpg]    contact sheet to pick from
//
// Licence policy: PD, CC0, CC BY → site + social. CC BY-SA → site only, unmodified, with attribution
// (a photo under text on a slide is an adaptation, which would put the post under BY-SA). Nothing else.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { parseArgs } from './lib/env.mjs';
import { LIBRARY_DIR } from './lib/library.mjs';

const args = parseArgs();
const cmd = process.argv[2];
const CATALOG = resolve(LIBRARY_DIR, 'catalog.json');
const SOCIAL_OK = /^(PD|CC0|CC-BY-(2\.0|2\.5|3\.0|4\.0))$/;
const SITE_OK = /^(PD|CC0|CC-BY-(2\.0|2\.5|3\.0|4\.0)|CC-BY-SA-(2\.0|2\.5|3\.0|4\.0))$/;
const SUBJECTS = new Set(['data-center', 'campus', 'construction', 'aerial', 'interior', 'transmission', 'substation', 'generation', 'solar', 'wind', 'gas', 'nuclear', 'hydro', 'geothermal', 'storage', 'land', 'cooling', 'water', 'archival']);

async function problems(entries) {
  const errs = [];
  const seen = new Set();
  for (const e of entries) {
    const at = e.id || '(no id)';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id || '')) errs.push(`${at}: id must be kebab-case`);
    if (seen.has(e.id)) errs.push(`${at}: duplicate id`);
    seen.add(e.id);
    const path = resolve(LIBRARY_DIR, e.file || '');
    if (!e.file || !existsSync(path)) errs.push(`${at}: file missing (${e.file})`);
    else {
      const m = await sharp(path).metadata().catch(() => null);
      if (!m || m.format !== 'jpeg') errs.push(`${at}: not a readable JPEG`);
      else if (m.width < 1000) errs.push(`${at}: only ${m.width}px wide`);
    }
    const code = e.license?.code || '';
    if (!SITE_OK.test(code)) errs.push(`${at}: licence "${code}" not allowed (PD, CC0, CC BY, CC BY-SA only)`);
    if (e.uses?.social && !SOCIAL_OK.test(code)) errs.push(`${at}: uses.social=true but ${code} is not cleared for posts`);
    if (!e.attribution || !/photo|image|map/i.test(e.attribution)) errs.push(`${at}: attribution text missing`);
    if (code !== 'PD' && code !== 'CC0' && !e.author) errs.push(`${at}: author required for ${code}`);
    if (!/^https?:\/\//.test(e.source?.page || '')) errs.push(`${at}: source.page URL missing`);
    for (const s of e.subjects || []) if (!SUBJECTS.has(s)) errs.push(`${at}: unknown subject "${s}"`);
    if (!(e.subjects || []).length) errs.push(`${at}: subjects[] empty`);
  }
  return errs;
}

async function loadCatalog() {
  return existsSync(CATALOG) ? JSON.parse(await readFile(CATALOG, 'utf8')) : { images: [] };
}

function filter(images) {
  const has = (arr, v) => (arr || []).some((x) => String(x).toLowerCase() === String(v).toLowerCase());
  return images.filter((e) =>
    (!args.subject || has(e.subjects, args.subject)) &&
    (!args.country || has(e.entities?.countries, args.country)) &&
    (!args.operator || has(e.entities?.operators, args.operator)) &&
    (!args.facility || has(e.entities?.facilitySlugs, args.facility)) &&
    (!args.social || e.uses?.social) &&
    (!args.text || `${e.title} ${e.notes || ''} ${(e.entities?.regions || []).join(' ')} ${(e.entities?.cities || []).join(' ')}`.toLowerCase().includes(String(args.text).toLowerCase())));
}

if (cmd === 'build') {
  const cat = await loadCatalog();
  const byId = new Map((cat.images || []).map((e) => [e.id, e]));
  const dir = resolve(LIBRARY_DIR, '_staging');
  for (const f of existsSync(dir) ? (await readdir(dir)).filter((x) => x.endsWith('.json')) : []) {
    const list = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    for (const e of list) byId.set(e.id, { ...e, addedAt: byId.get(e.id)?.addedAt || new Date().toISOString().slice(0, 10) });
  }
  const images = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const errs = await problems(images);
  const out = {
    note: 'Licensed photos for Coloprice posts and the dc-network sites. PD/CC0/CC BY: site + social. CC BY-SA: site only, unmodified, with attribution. Always print `attribution` next to the image (slide footer, figcaption).',
    updated: new Date().toISOString().slice(0, 10),
    images,
  };
  await writeFile(CATALOG, JSON.stringify(out, null, 1) + '\n');
  const bySub = {};
  for (const e of images) for (const s of e.subjects) bySub[s] = (bySub[s] || 0) + 1;
  console.log(`✓ catalog.json: ${images.length} images (${images.filter((e) => e.uses?.social).length} cleared for social)`);
  console.log('  by subject:', Object.entries(bySub).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  if (errs.length) { console.error(`✗ ${errs.length} problem(s):\n  - ${errs.join('\n  - ')}`); process.exit(1); }
} else if (cmd === 'check') {
  const errs = await problems((await loadCatalog()).images || []);
  if (errs.length) { console.error(`✗ ${errs.length} problem(s):\n  - ${errs.join('\n  - ')}`); process.exit(1); }
  console.log('✓ library catalog ok');
} else if (cmd === 'find') {
  for (const e of filter((await loadCatalog()).images || [])) console.log(`${e.id.padEnd(48)} ${e.uses?.social ? 'social' : 'site  '} ${e.license.code.padEnd(12)} ${e.title}`);
} else if (cmd === 'sheet') {
  const list = filter((await loadCatalog()).images || []).slice(0, Number(args.limit || 48));
  if (!list.length) { console.log('nothing matches'); process.exit(0); }
  const cols = 6, tw = 300, th = 200, lh = 34;
  const rows = Math.ceil(list.length / cols);
  const tiles = await Promise.all(list.map(async (e, i) => {
    const img = await sharp(resolve(LIBRARY_DIR, e.file)).resize(tw, th, { fit: 'cover' }).jpeg().toBuffer();
    const label = Buffer.from(`<svg width="${tw}" height="${lh}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#08090a"/><text x="6" y="22" font-family="monospace" font-size="13" fill="${e.uses?.social ? '#e4f222' : '#9aa0a6'}">${e.id.slice(0, 40).replace(/&/g, '&amp;')}</text></svg>`);
    return [{ input: img, left: (i % cols) * tw, top: Math.floor(i / cols) * (th + lh) }, { input: label, left: (i % cols) * tw, top: Math.floor(i / cols) * (th + lh) + th }];
  }));
  const out = resolve(args.out || 'out/library-sheet.jpg');
  await mkdir(resolve(out, '..'), { recursive: true });
  await sharp({ create: { width: cols * tw, height: rows * (th + lh), channels: 3, background: '#08090a' } }).composite(tiles.flat()).jpeg({ quality: 80 }).toFile(out);
  console.log(`✓ ${list.length} images → ${out} (lime label = cleared for social)`);
} else {
  console.log('usage: node scripts/library.mjs build | check | find [filters] | sheet [filters]');
  process.exit(2);
}
