// node --test scripts/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { numbersIn, validateCarousel } from './validate-carousel.mjs';
import { QUEUE_DIR, bangkokDate } from './lib/env.mjs';

const sample = () => JSON.parse(readFileSync(resolve(QUEUE_DIR, readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort()[0]), 'utf8'));

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
  const def = sample();
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
  const def = sample();
  assert.match(def.caption, /coloprice\.com/);
  const state = { published: { a: { publishedAt: '2026-10-01T00:00:00Z', mentionsDomain: true } } };
  const { errors } = validateCarousel(def, { fit: false, state });
  assert.ok(errors.some((e) => e.includes('once every 3 posts')));
});

test('bangkokDate rolls over at 17:00 UTC', () => {
  assert.equal(bangkokDate(new Date('2026-10-28T16:59:00Z')), '2026-10-28');
  assert.equal(bangkokDate(new Date('2026-10-28T17:00:00Z')), '2026-10-29');
});
