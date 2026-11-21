// Gets the readable text of a news article so the AI can write a detailed summary
// in its own words. Article text is only used during the run; it is never saved.
// Google News RSS links are wrappers, so we first resolve them to the real URL.

import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const quiet = new VirtualConsole();

async function get(url, opts = {}) {
  const res = await fetch(url, { redirect: 'follow', ...opts, headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', ...(opts.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// Resolve news.google.com/rss/articles/<id> to the publisher URL.
export async function resolveGoogleNews(url) {
  const m = url.match(/news\.google\.com\/(?:rss\/)?articles\/([^?/]+)/);
  if (!m) return url;
  const id = m[1];
  const html = await (await get(`https://news.google.com/articles/${id}`)).text();
  const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sig || !ts) throw new Error('google news: no signature');
  const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sig]);
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
  const res = await get('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
  });
  const text = await res.text();
  const real = text.match(/\[\\"garturlres\\",\\"(.*?)\\"/)?.[1];
  if (!real) throw new Error('google news: decode failed');
  return real.replace(/\\\\u003d/g, '=').replace(/\\\\u0026/g, '&').replace(/\\\\/g, '');
}

// Reads an article page: its text (for the AI, never saved) and the page's own share
// picture (og:image), which the app may show by linking to it (we never copy the picture).
export async function articlePage(url) {
  const res = await get(url);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('html')) throw new Error('not html');
  const html = await res.text();
  const dom = new JSDOM(html, { url: res.url, virtualConsole: quiet });
  const doc = dom.window.document;
  const meta = (...names) => {
    for (const n of names) {
      const v = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.getAttribute('content');
      if (v) return v.trim();
    }
    return null;
  };
  let img = meta('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src');
  try { if (img) img = new URL(img, res.url).href; } catch { img = null; }
  const imgW = Number(meta('og:image:width')) || null, imgH = Number(meta('og:image:height')) || null;
  const art = new Readability(doc).parse();
  const text = (art?.textContent || '').replace(/\s+/g, ' ').trim();
  return { url: res.url, text: text.length >= 300 ? text.slice(0, 5000) : null, img, imgW, imgH };
}

export async function articleText(url) {
  const p = await articlePage(url);
  if (!p.text) throw new Error('too little text (paywall?)');
  return p.text;
}
