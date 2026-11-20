// Fetches news from FEEDS, uses Claude to translate titles, categorise, score,
// summarise the important stories and explain impact on Malaysia / SEA / World.
// Writes data/news.json for the web app. Runs in GitHub Actions every 30 min.
//
// Env:
//   ANTHROPIC_API_KEY  (optional; without it the app still works, with no AI summaries)
//   CLAUDE_MODEL       (optional; default claude-haiku-5-5)

import { XMLParser } from 'fast-xml-parser';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FEEDS, CATEGORIES } from './feeds.mjs';

const OUT = new URL('../data/news.json', import.meta.url);
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

const KEEP_HOURS = 72;          // how long stories stay in news.json
const NEW_WINDOW_HOURS = 30;    // only process stories newer than this
const PER_FEED = 20;            // newest N per feed
const MAX_TRIAGE = 120;         // cost cap: max new headlines triaged per run
const MAX_SUMMARY = 15;         // cost cap: max full summaries per run
const SUMMARY_MIN_SCORE = 4;    // only stories scored >= this get a summary + impact

const parser = new XMLParser({ processEntities: false, ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text' });
const text = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? v['@href'] ?? '') : String(v));
const clean = (s) =>
  text(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const idOf = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const normTitle = (t) => t.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 40);

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (LeLeNews; +https://github.com)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = parser.parse(await res.text());
  let items = xml?.rss?.channel?.item ?? xml?.feed?.entry ?? xml?.['rdf:RDF']?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  const isGoogle = feed.url.includes('news.google.com');
  return items.slice(0, PER_FEED).map((it) => {
    let title = clean(it.title);
    let source = feed.name;
    if (isGoogle) {
      // Google News titles look like "Headline - Publisher"
      const pub = clean(it.source);
      if (pub) { source = pub; title = title.replace(new RegExp(`\\s+-\\s+${pub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''); }
    }
    const link = text(it.link) || (Array.isArray(it.link) ? text(it.link[0]) : '') || text(it.guid);
    const date = new Date(text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']) || Date.now());
    return {
      id: idOf(link || title),
      title,
      url: link,
      source,
      feed: feed.name,
      cat: feed.cat,
      published: isNaN(date) ? new Date().toISOString() : date.toISOString(),
      desc: isGoogle ? '' : clean(it.description || it.summary || it['content:encoded']).slice(0, 600),
    };
  }).filter((x) => x.title && x.url);
}

async function claude(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const out = data.content.map((c) => c.text || '').join('');
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
  return JSON.parse(json);
}

// Step 1: cheap triage of headlines -> Chinese title, category, importance, duplicates
async function triage(items) {
  const list = items.map((x) => ({ id: x.id, t: x.title, s: x.source, d: x.desc.slice(0, 160) }));
  const prompt = `你是马来西亚华人读者的新闻编辑。读者关心：财经、国际、东南亚、马来西亚、中国、科技。
下面是新闻标题列表(JSON)。为每一条输出：
- id
- zh: 简体中文标题(原本是中文就保留原意稍作精简；英文就翻译)，不超过32字
- cat: ${CATEGORIES.join('|')}|other 之一(娱乐、体育、社会小事、犯罪个案等用 other)
- score: 1-5 重要性(5=影响市场/区域/全球的大事，1=琐碎)
- dup: 如果和列表里另一条是同一事件，填那条的 id，否则 null

只输出 JSON 数组，不要其他文字。
${JSON.stringify(list)}`;
  return claude(prompt, 8000);
}

// Step 2: summary + 3-level impact for the important ones
async function summarise(items) {
  const list = items.map((x) => ({ id: x.id, t: x.zh || x.title, orig: x.title, s: x.source, d: x.desc }));
  const prompt = `你是给马来西亚华人读者写新闻摘要的编辑。对每条新闻输出：
- id
- sum: 2-3句简体中文摘要。只根据提供的标题和内容写，不要编造数字、人名或细节；信息不足就写得简短。
- my: 对马来西亚的影响(令吉、股市、物价、就业、政策等)，1句；没有明显影响就填 null
- sea: 对东南亚的影响，1句；没有就 null
- world: 对全球的影响，1句；没有就 null
影响部分是分析，不是事实，用"可能"等字眼，不要夸大。

只输出 JSON 数组，不要其他文字。
${JSON.stringify(list)}`;
  return claude(prompt, 6000);
}

async function main() {
  let old = { items: [] };
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const known = new Map(old.items.map((x) => [x.id, x]));

  const report = [];
  const fresh = [];
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { fresh.push(...r.value); report.push(`OK   ${FEEDS[i].name}: ${r.value.length}`); }
    else report.push(`FAIL ${FEEDS[i].name}: ${r.reason?.message || r.reason}`);
  });
  console.log(report.join('\n'));

  const now = Date.now();
  const cutoffNew = now - NEW_WINDOW_HOURS * 3600e3;
  const seenTitles = new Set(old.items.map((x) => normTitle(x.title)));
  const newItems = [];
  for (const x of fresh.sort((a, b) => b.published.localeCompare(a.published))) {
    if (known.has(x.id) || Date.parse(x.published) < cutoffNew || Date.parse(x.published) > now + 3600e3) continue;
    const nt = normTitle(x.title);
    if (seenTitles.has(nt)) continue;
    seenTitles.add(nt);
    newItems.push(x);
  }
  console.log(`New stories: ${newItems.length}`);

  let added = newItems.slice(0, MAX_TRIAGE);
  if (KEY && added.length) {
    try {
      const tri = new Map();
      for (let i = 0; i < added.length; i += 60) {
        for (const r of await triage(added.slice(i, i + 60))) tri.set(r.id, r);
      }
      added = added.filter((x) => {
        const t = tri.get(x.id);
        if (!t) return true;
        x.zh = t.zh; x.cat = t.cat; x.score = t.score;
        return t.cat !== 'other' && !t.dup;
      });
      const important = added.filter((x) => x.score >= SUMMARY_MIN_SCORE)
        .sort((a, b) => b.score - a.score).slice(0, MAX_SUMMARY);
      if (important.length) {
        const sums = new Map((await summarise(important)).map((r) => [r.id, r]));
        for (const x of important) {
          const s = sums.get(x.id);
          if (s) { x.sum = s.sum; x.impact = { my: s.my || null, sea: s.sea || null, world: s.world || null }; }
        }
      }
    } catch (e) {
      console.error('AI step failed, keeping stories without AI:', e.message);
    }
  }
  for (const x of added) {
    if (x.score == null) x.score = 3;
    if (!x.sum && x.desc) x.sum = x.desc.slice(0, 160);
    delete x.desc;
    x.fetched = new Date().toISOString();
  }

  const cutoffKeep = now - KEEP_HOURS * 3600e3;
  const items = [...added, ...old.items]
    .filter((x) => Date.parse(x.published) >= cutoffKeep)
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 600);

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), ai: Boolean(KEY), feeds: report, items }, null, 1));
  console.log(`Wrote ${items.length} stories (${added.length} new).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
