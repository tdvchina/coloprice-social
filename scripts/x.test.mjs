// X (Twitter) cross-posting: text derivation, link/number/denylist rules, OAuth 1.0a signing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUEUE_DIR } from './lib/env.mjs';
import { factNumbers, missingNumbers } from './lib/rules.mjs';
import { buildXPost, xPostErrors, tweetLength, hasLink, replyUrl, pickSlides, X_MAX } from './lib/xpost.mjs';
import { oauthHeader } from './lib/oauth1.mjs';
import { validateCarousel } from './validate-carousel.mjs';

const files = () => readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort();
const load = (f) => JSON.parse(readFileSync(resolve(QUEUE_DIR, f), 'utf8'));
const mw = () => load(files().find((f) => f.includes('megawatt-watch-2026-10-28')));

test('derived X post for every queued carousel: ≤280, no URL, numbers from facts, clean', () => {
  for (const f of files()) {
    const def = load(f);
    const p = buildXPost(def);
    assert.ok(tweetLength(p.text) <= X_MAX, `${f}: ${tweetLength(p.text)} chars`);
    assert.equal(hasLink(p.text), false, `${f}: link in main post`);
    assert.doesNotMatch(p.text, /link in bio|https?:|coloprice\.com/i, f);
    assert.deepEqual(missingNumbers(p.text, factNumbers(def)), [], `${f}: invented number`);
    assert.match(p.text, /^Data: /m, `${f}: Data line`);
    assert.equal(p.text.split('\n')[0], def.caption.split('\n')[0], `${f}: hook = caption line 1`);
    assert.ok(p.slides.length >= 2 && p.slides.length <= 4 && p.slides[0] === 1, `${f}: cover + up to 3`);
    assert.ok(p.alts.every((a) => a.length > 10 && a.length <= 1000), `${f}: alt texts`);
    assert.match(p.reply, /^Full table \+ sources: coloprice\.com/, f);
    assert.deepEqual(xPostErrors(def, { env: {} }), [], f);
  }
});

test('megawatt-watch: hook + supporting fact + data line, reply to the pipeline page, informative slides', () => {
  const def = mw();
  const p = buildXPost(def);
  assert.match(p.text, /^480 MW of new data center capacity/);
  assert.match(p.text, /280 MW/);
  assert.match(p.text, /Data: Coloprice pipeline tracker/);
  assert.equal(replyUrl(def), 'https://coloprice.com/pipeline/');
  assert.deepEqual(pickSlides(def), [1, 2, 3, 6]); // cover, hbar chart, key stat, list — not the closing slide
  assert.match(p.alts[1], /^Bar chart: .*Crusoe × Araico · Paraguay 280 MW/);
});

test('weighted length: Latin 1, CJK/emoji 2, URLs 23', () => {
  assert.equal(tweetLength('abc'), 3);
  assert.equal(tweetLength('São Paulo × 2.5 – ok'), 20);
  assert.equal(tweetLength('東京'), 4);
  assert.equal(tweetLength('see https://coloprice.com/a/very/long/path'), 4 + 23);
});

test('publisher names that are domains (W.Media) never become links in the main post', () => {
  assert.equal(hasLink('Data: W.Media, DCD'), true);
  assert.equal(hasLink('Data: W Media, DCD'), false);
  assert.equal(hasLink('70.8 MW in the U.S. today'), false);
  assert.doesNotMatch(buildXPost(mw()).text, /W\.Media/);
});

test('x.text override: invented number, URL, length and denylist are rejected without echoing the term', () => {
  const def = mw();
  def.x = { text: '480 MW announced. Prices up 42% — details at coloprice.com/pipeline/ ' + 'x'.repeat(260) };
  const all = xPostErrors(def, { env: { CONTENT_DENYLIST: 'paraguay' } }).join('\n');
  assert.match(all, /42/);
  assert.match(all, /no URL or domain in the main post/);
  assert.match(all, /> 280/);
  assert.match(all, /CONTENT_DENYLIST entry #1/); // alt text of the Paraguay slides matches
  assert.doesNotMatch(all, /paraguay/i);
  // and the hard validator surfaces it as x: errors (blocks the queue item, like any invented number)
  assert.ok(validateCarousel(def, { fit: false, env: {} }).errors.some((e) => e.startsWith('x: ')));
});

test('x.slides / x.replyPath overrides are validated and used', () => {
  const def = mw();
  def.x = { slides: [1, 6], replyPath: '/capacity-watch/' };
  const p = buildXPost(def);
  assert.deepEqual(p.slides, [1, 6]);
  assert.equal(p.reply, 'Full table + sources: coloprice.com/capacity-watch/');
  assert.deepEqual(xPostErrors(def, { env: {} }), []);
  def.x = { slides: [0, 1, 2, 3, 4], replyPath: 'https://example.com/' };
  const all = xPostErrors(def, { env: {} }).join('\n');
  assert.match(all, /x\.slides: 1–4/);
  assert.match(all, /x\.replyPath/);
});

test('investment advice in an x.text override is rejected', () => {
  const def = mw();
  def.x = { text: '480 MW announced in two days. Buy the stock now.' };
  assert.match(xPostErrors(def, { env: {} }).join('\n'), /investment advice/);
});

test('OAuth 1.0a: HMAC-SHA1 signature matches the worked example in the X docs', () => {
  // Public sample values from the X/Twitter "Creating a signature" guide — not real credentials.
  const h = oauthHeader({
    method: 'POST',
    url: 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    creds: {
      consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
      consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    },
    form: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    timestamp: 1318622958,
  });
  assert.match(h, /^OAuth /);
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});
