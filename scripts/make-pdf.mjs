// Stitch a rendered carousel (out/<slug>/*.jpg) into one PDF for LinkedIn document posts.
// Zero dependencies: JPEGs are embedded as-is (DCTDecode), one slide per page at its pixel size.
// Usage: node scripts/make-pdf.mjs <slug> [--out out/<slug>/<slug>.pdf]   |   node scripts/make-pdf.mjs --all
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('bad JPEG marker');
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('no SOF segment');
}

export function buildPdf(jpegs, title) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); chunks.push(buf); pos += buf.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); for (const part of [].concat(body)) push(part); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const n = jpegs.length;
  // 1 catalog, 2 pages, 3 info, then per slide: page, content, image
  const pageIds = jpegs.map((_, k) => 4 + k * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`);
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, '');
  obj(3, `<< /Title (${esc(title)}) /Producer (Coloprice) /Creator (coloprice-social) >>`);
  jpegs.forEach((buf, k) => {
    const { w, h, comps } = jpegSize(buf);
    const [pg, ct, im] = [4 + k * 3, 5 + k * 3, 6 + k * 3];
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    obj(ct, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    const cs = comps === 1 ? '/DeviceGray' : comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${buf.length} >>\nstream\n`, buf, '\nendstream']);
  });
  const total = 4 + n * 3;
  const xref = pos;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let k = 1; k < total; k++) push(`${String(offsets[k]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

function stitch(slug, outFile) {
  const dir = path.join(OUT, slug);
  const files = fs.readdirSync(dir).filter((f) => /^\d+\.jpe?g$/i.test(f)).sort();
  if (!files.length) throw new Error(`no slides in ${dir} — render the carousel first`);
  let title = slug;
  // queue files are NNN-<slug>.json; the cover carries the title in `headline` (or `statement` on quote covers)
  const qdir = path.join(ROOT, 'content', 'queue');
  const qf = fs.existsSync(qdir) ? fs.readdirSync(qdir).find((f) => f === `${slug}.json` || new RegExp(`^\\d{3}-${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.json$`).test(f)) : null;
  if (qf) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(qdir, qf), 'utf8'));
      const c = d.slides?.[0] || {};
      title = String(d.title || c.headline || c.statement || d.topic || slug).replace(/\*\*/g, '');
    } catch {}
  }
  const pdf = buildPdf(files.map((f) => fs.readFileSync(path.join(dir, f))), `Coloprice - ${title}`);
  const dest = outFile || path.join(dir, `${slug}.pdf`);
  fs.writeFileSync(dest, pdf);
  console.log(`✓ ${path.relative(ROOT, dest)} — ${files.length} pages, ${(pdf.length / 1024).toFixed(0)} KB`);
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
const known = new Set(['--all', '--out']);
for (const a of args) if (a.startsWith('--') && !known.has(a)) { console.error(`unknown flag ${a}`); process.exit(2); }
if (args.includes('--all')) {
  for (const s of fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory())) stitch(s);
} else if (args[0] && !args[0].startsWith('--')) {
  stitch(args[0], outFile);
} else {
  console.error('usage: node scripts/make-pdf.mjs <slug> | --all'); process.exit(2);
}
