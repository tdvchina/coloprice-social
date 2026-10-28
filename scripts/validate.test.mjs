// node --test scripts/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { numbersIn, validateCarousel } from './validate-carousel.mjs';
import { buildSlide, slideContext } from './lib/slides.mjs';
import { isLand } from './lib/map.mjs';
import { QUEUE_DIR, bangkokDate } from './lib/env.mjs';

const queueFiles = () => readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort();
const load = (f) => JSON.parse(readFileSync(resolve(QUEUE_DIR, f), 'utf8'));
const sample = () => load(queueFiles()[0]);
const withDomain = () => queueFiles().map(load).find((d) => /coloprice\.com/.test(d.caption));

test('numbersIn skips years, model names and dates', () => {
  assert.deepEqual(numbersIn('H100 at $3.49/hr in 2026, 27 Oct'), [3.49]);
  assert.deepEqual(numbersIn('33,387 MW and 70.8 MW'), [33387, 70.8]);
  assert.deepEqual(numbersIn('Jun 23 to Oct 26'), []);
});

test('sample queue item is valid', () => {
  const def = sample();
  const { errors } = validateCarousel(def, { fit: false });
  assert.deepEqual(errors, []);
});

test('invented number on a slide is rejected', () => {
  const def = sample();
  def.slides[1] = { ...def.slides[1], title: 'Prices up 42% this year' };
  const { errors } = validateCarousel(def, { fit: false });
  assert.ok(errors.some((e) => e.includes('42')));
});

test('caption rules: URL, hashtags count, investment advice, denylist', () => {
  const def = queueFiles().map(load).find((d) => /vera rubin/i.test(d.caption)) || sample();
  def.caption = def.caption.replace('link in bio', 'see https://example.com') + '\nBuy the stock now.';
  def.hashtags = ['#a1', '#b2', '#c3', '#d4', '#e5', '#f6'];
  const { errors } = validateCarousel(def, { fit: false, env: { CONTENT_DENYLIST: 'vera rubin' } });
  const all = errors.join('\n');
  assert.match(all, /no URLs/);
  assert.match(all, /link in bio/);
  assert.match(all, /hashtags: 3–5/);
  assert.match(all, /investment advice/);
  assert.match(all, /CONTENT_DENYLIST entry #1/);
  assert.doesNotMatch(all, /vera rubin/i); // never echo denylisted terms
});

test('coloprice.com at most once every 3 posts', () => {
  const def = withDomain();
  assert.match(def.caption, /coloprice\.com/);
  const state = { published: { a: { publishedAt: '2026-10-01T00:00:00Z', mentionsDomain: true } } };
  const { errors } = validateCarousel(def, { fit: false, state });
  assert.ok(errors.some((e) => e.includes('once every 3 posts')));
});

test('bangkokDate rolls over at 17:00 UTC', () => {
  assert.equal(bangkokDate(new Date('2026-10-28T16:59:00Z')), '2026-10-28');
  assert.equal(bangkokDate(new Date('2026-10-28T17:00:00Z')), '2026-10-29');
});

test('every queued carousel validates and lays out cleanly (all templates and themes)', () => {
  for (const f of queueFiles()) {
    const { errors } = validateCarousel(load(f), { file: f });
    assert.deepEqual(errors, [], f);
  }
});

test('new templates: map values are data, **marks** are ignored, layouts are checked', () => {
  const def = queueFiles().map(load).find((d) => d.slides.some((s) => s.type === 'map'));
  const i = def.slides.findIndex((s) => s.type === 'map');
  def.slides[i] = { ...def.slides[i], points: [...def.slides[i].points, { label: 'Atlantis', value: 999, lat: 0, lon: -30 }] };
  assert.ok(validateCarousel(def, { fit: false }).errors.some((e) => e.includes('999')));
  const q = queueFiles().map(load).find((d) => d.slides.some((s) => s.type === 'quote'));
  const qi = q.slides.findIndex((s) => s.type === 'quote');
  q.slides[qi] = { ...q.slides[qi], text: '**Highlighted** words, no numbers' };
  assert.deepEqual(validateCarousel(q, { fit: false }).errors, []);
  const p = sample();
  p.slides[0] = { ...p.slides[0], layout: 'poster', figure: undefined };
  assert.ok(validateCarousel(p, { fit: false }).errors.some((e) => e.includes('poster needs figure.value')));
  p.slides[0] = { ...p.slides[0], layout: 'nope' };
  assert.ok(validateCarousel(p, { fit: false }).errors.some((e) => e.includes('layout must be one of')));
});

test('themes render: every template on dark, paper and lime', () => {
  const def = sample();
  const ctx = slideContext(def);
  const kinds = [
    def.slides[0],
    { type: 'quote', text: 'A **marked** statement.', refs: def.slides[0].refs },
    { type: 'compare', title: 'A vs B', items: [{ label: 'A', value: '$1' }, { label: 'B', value: '$2', highlight: true }], refs: def.slides[0].refs },
  ];
  for (const theme of ['dark', 'paper', 'lime'])
    for (const s of kinds) {
      const { svg, issues } = buildSlide({ ...s, theme }, { ...ctx, index: 1 });
      assert.match(svg, /^<svg/);
      assert.deepEqual(issues, [], `${s.type}/${theme}`);
    }
});

test('land mask: Natural Earth polygons', () => {
  assert.equal(isLand(2.35, 48.86), true); // Paris
  assert.equal(isLand(-30, 0), false); // Atlantic
  assert.equal(isLand(133, -25), true); // Australia
});
