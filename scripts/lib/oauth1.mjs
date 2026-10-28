// OAuth 1.0a (HMAC-SHA1) request signing for the X API, user context. node:crypto only.
// RFC 5849 + X docs "Creating a signature": the signature base string covers the method, the URL
// without query, the oauth_* params, the query string and an application/x-www-form-urlencoded
// body. JSON and multipart/form-data bodies are NOT signed — which is exactly what /2/tweets
// (JSON), /2/media/upload/initialize (JSON) and /2/media/upload/{id}/append (multipart) use.
import { createHmac, randomBytes } from 'node:crypto';

/** RFC 3986 percent-encoding (encodeURIComponent leaves !'()* alone). */
export const pct = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function signatureBase(method, url, params) {
  const u = new URL(url);
  const base = `${u.protocol}//${u.host}${u.pathname}`; // WHATWG URL already lowercases scheme + host, drops default port
  const pairs = params.map(([k, v]) => [pct(k), pct(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return [method.toUpperCase(), pct(base), pct(pairs.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
}

/**
 * Authorization header value for one request.
 * creds: { consumerKey, consumerSecret, token, tokenSecret }
 * form:  object of x-www-form-urlencoded body params (only then is the body signed)
 * nonce/timestamp: injectable for tests.
 */
export function oauthHeader({ method, url, creds, form = {}, nonce = randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000) }) {
  const oauth = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: creds.token,
    oauth_version: '1.0',
  };
  const params = [...new URL(url).searchParams.entries(), ...Object.entries(oauth), ...Object.entries(form)];
  const key = `${pct(creds.consumerSecret)}&${pct(creds.tokenSecret)}`;
  const signature = createHmac('sha1', key).update(signatureBase(method, url, params)).digest('base64');
  const all = { ...oauth, oauth_signature: signature };
  return 'OAuth ' + Object.keys(all).sort().map((k) => `${pct(k)}="${pct(all[k])}"`).join(', ');
}
