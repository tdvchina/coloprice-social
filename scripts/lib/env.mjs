// Paths, tiny .env loader (no deps) and CLI arg parser shared by all scripts.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const QUEUE_DIR = resolve(ROOT, 'content/queue');
export const INBOX_DIR = resolve(ROOT, 'content/inbox');
export const DATA_DIR = resolve(ROOT, 'content/data');
export const STATE_FILE = resolve(ROOT, 'content/state.json');
// Rendered slides. This folder IS the public hosting root: SLIDES_BASE_URL/<slug>/NN.jpg
export const OUT_DIR = resolve(ROOT, 'out');

/** .env then .env.local (override). Real env vars (CI secrets) always win. */
export function loadEnv() {
  const preset = new Set(Object.keys(process.env));
  for (const name of ['.env', '.env.local']) {
    const p = resolve(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[2] !== '' && !preset.has(m[1])) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      args[k] = v.length ? v.join('=') : true;
    } else args._.push(a);
  }
  return args;
}

/** YYYY-MM-DD in Asia/Bangkok (the "day" for the 1-post-per-day rule). */
export function bangkokDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export const slideFile = (i) => `${String(i + 1).padStart(2, '0')}.jpg`;
