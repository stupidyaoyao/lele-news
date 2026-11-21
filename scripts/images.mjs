// Pictures for stories and storylines.
//   A = the news site's own share picture (we only store its link and credit the site)
//   B = a free-licence photo from Wikimedia Commons / Wikidata (credited with author + licence)
//   C = drawn in the app (no data needed here)
// Rules: landscape, at least 600 px wide, not a logo, AI check that it fits the headline and is not graphic.

import { imageSize } from 'image-size';

const UA = 'LeleNews/2.1 (https://github.com/stupidyaoyao/lele-news; family news app)';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const VISION_MODEL = 'gemini-flash-lite-latest';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD_URL = /logo|placeholder|default[-_]?(image|img|og)|favicon|sprite|blank|share[-_]?image|og[-_]default/i;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Download a picture (only to measure it and let the AI look at it; it is not saved)
async function download(src) {
  const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const type = r.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error('not an image');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 6e6) throw new Error('too big');
  const { width, height } = imageSize(buf);
  return { buf, type: type.split(';')[0], width, height };
}

// Ask Gemini to look at the picture
async function visionCheck(buf, mime, headline) {
  if (!GEMINI_KEY) return { ok: true, why: 'no-ai' };
  const prompt = `这是新闻配图的候选图片。新闻标题：「${headline}」
只输出 JSON 数组，内含一个对象：[{"relevant": true/false, "graphic": true/false, "logo": true/false, "people": ["图中能认出的公众人物英文名"]}]
- relevant：图片内容和标题的新闻有关（人物、地点、事件、物品），不是无关的广告或别的新闻
- graphic：有血腥、伤者、遗体、尸体、暴力画面
- logo：只是网站标志、文字海报、纯色图、图表截图`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: buf.toString('base64') } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  const data = await res.json();
  const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const s = out.indexOf('['), e = out.lastIndexOf(']');
  const r = JSON.parse(out.slice(s, e + 1))[0] || {};
  return { ok: Boolean(r.relevant) && !r.graphic && !r.logo, graphic: Boolean(r.graphic), logo: Boolean(r.logo), people: r.people || [] };
}

// A: check a news site's share picture against the rules. Returns {src, credit, kind:'A'} or null.
export async function checkPublisherImage(src, { headline, source, logoSet }) {
  if (!src || !/^https?:/.test(src) || BAD_URL.test(src) || logoSet.has(src)) return null;
  let img;
  try { img = await download(src); } catch (e) { console.log(`  img A skip (${source}): ${e.message}`); return null; }
  const ratio = img.width / img.height;
  if (img.width < 600 || ratio < 1.15 || ratio > 2.4) { console.log(`  img A skip (${source}): ${img.width}x${img.height}`); return null; }
  try {
    const v = await visionCheck(img.buf, img.type, headline);
    await sleep(4000);
    if (!v.ok) { console.log(`  img A rejected (${source}): ${v.graphic ? 'graphic' : v.logo ? 'logo' : 'not relevant'}`); return null; }
  } catch (e) { console.log(`  vision failed (${e.message}); keep picture unchecked off`); return null; }
  return { src, credit: source, kind: 'A' };
}

// ---------- B: free-licence photos ----------
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
async function commonsInfo(titles) {
  const q = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '640', titles: titles.join('|') });
  const r = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  return Object.values(r.query?.pages || {}).map((p) => {
    const ii = p.imageinfo?.[0]; if (!ii) return null;
    const m = ii.extmetadata || {};
    const lic = stripHtml(m.LicenseShortName?.value);
    if (!/^(cc|public domain|pd)/i.test(lic)) return null; // only free licences
    const artist = stripHtml(m.Artist?.value).slice(0, 40) || 'Wikimedia';
    return { title: p.title, w: ii.width, h: ii.height, src: ii.thumburl, credit: `${artist} · Wikimedia Commons · ${lic}` };
  }).filter(Boolean);
}
// A topic photo, e.g. "container port", "gold bars"
export async function commonsPhoto(query) {
  if (!query) return null;
  try {
    const q = new URLSearchParams({ action: 'query', format: 'json', origin: '*', list: 'search', srnamespace: '6', srlimit: '10', srsearch: `${query} filetype:bitmap` });
    const r = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
    const titles = (r.query?.search || []).map((s) => s.title).filter((t) => /\.(jpe?g|png|webp)$/i.test(t)).slice(0, 8);
    if (!titles.length) return null;
    const infos = (await commonsInfo(titles)).filter((i) => i.w >= 800 && i.w / i.h >= 1.2 && i.w / i.h <= 2.2 && !/logo|map|flag|diagram|chart|coat of arms/i.test(i.title));
    const best = infos[0];
    return best ? { src: best.src, credit: best.credit, kind: 'B' } : null;
  } catch (e) { console.log(`  commons "${query}": ${e.message}`); return null; }
}
// A person's official photo via Wikidata (P18)
export async function personPhoto(name) {
  if (!name) return null;
  try {
    const q = new URLSearchParams({ action: 'wbsearchentities', format: 'json', origin: '*', language: 'en', type: 'item', limit: '1', search: name });
    const r = await getJson(`https://www.wikidata.org/w/api.php?${q}`);
    const id = r.search?.[0]?.id; if (!id) return null;
    const e = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
    const claims = e.entities?.[id]?.claims || {};
    const isHuman = (claims.P31 || []).some((c) => c.mainsnak?.datavalue?.value?.id === 'Q5');
    const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!isHuman || !file) return null;
    const [info] = await commonsInfo([`File:${file}`]);
    return info ? { src: info.src, credit: info.credit, kind: 'B', person: name } : null;
  } catch (err) { console.log(`  wikidata "${name}": ${err.message}`); return null; }
}

// Topic photos per tag, cached in data/photos.json (looked up once, refreshed monthly)
export const TAG_EN = {
  黄金: 'gold bars bullion', 白银: 'silver bullion bars', 油价: 'oil refinery', 令吉: 'Malaysian ringgit banknotes', 马股: 'Bursa Malaysia building',
  股市: 'stock exchange trading floor', 美股: 'New York Stock Exchange building', 港股: 'Hong Kong Exchange Square', A股: 'Shanghai Stock Exchange building',
  美联储: 'Federal Reserve Eccles Building', 利率: 'central bank building', 通胀: 'supermarket shelves prices', 汇率: 'currency exchange banknotes',
  经济: 'Kuala Lumpur skyline', 房地产: 'apartment buildings construction', 银行: 'bank building', 加密货币: 'bitcoin coins',
  人工智能: 'data center servers', 芯片: 'semiconductor wafer', 电动车: 'electric car charging', 科技公司: 'technology office building',
  中美关系: 'Great Hall of the People Beijing', 中国经济: 'Shanghai Lujiazui skyline', 东盟: 'ASEAN Secretariat building Jakarta',
  新加坡: 'Singapore Marina Bay skyline', 印尼: 'Jakarta skyline', 泰国: 'Bangkok skyline', 越南: 'Hanoi skyline', 菲律宾: 'Manila skyline',
  马来西亚政治: 'Parliament of Malaysia building', 国际政治: 'United Nations headquarters New York', 战争冲突: 'military vehicles convoy',
  中东: 'Middle East city skyline', 俄乌: 'Kyiv city', 能源: 'power plant electricity', 气候: 'solar panels wind turbines',
  贸易: 'container port ship cranes', 就业: 'office workers commute', 教育: 'university campus library', 健康: 'hospital building', 交通: 'highway traffic Malaysia',
};
export async function updateTagPhotos(cache) {
  const month = 30 * 864e5;
  let n = 0;
  for (const [tag, q] of Object.entries(TAG_EN)) {
    const c = cache[tag];
    if (c && Date.now() - c.at < month) continue;
    if (n++ >= 12) break; // a few per run
    const p = await commonsPhoto(q);
    cache[tag] = { at: Date.now(), ...(p || { src: null }) };
    await sleep(500);
  }
  return cache;
}
