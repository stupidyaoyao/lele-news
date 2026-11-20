// Fetches news from FEEDS, uses AI (Gemini free tier, or Claude) to translate titles,
// categorise, score, summarise the important stories and explain impact on
// Malaysia / SEA / World. Writes data/news.json for the web app.
// Runs in GitHub Actions every hour. Uses ONE AI request per run to stay inside free limits.
//
// Env (set as GitHub repo secrets; all optional, without a key the app shows plain headlines):
//   GEMINI_API_KEY     -> uses Google Gemini (free tier)
//   ANTHROPIC_API_KEY  -> uses Claude (paid), used only if no Gemini key
//   GEMINI_MODEL / CLAUDE_MODEL to override the model

import { XMLParser } from 'fast-xml-parser';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FEEDS, CATEGORIES } from './feeds.mjs';
import { updateGold } from './gold.mjs';
import { resolveGoogleNews, articleText } from './article.mjs';

const OUT = new URL('../data/news.json', import.meta.url);
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const PROVIDER = GEMINI_KEY ? 'gemini' : CLAUDE_KEY ? 'claude' : null;
const GEMINI_MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-lite-latest', 'gemini-flash-latest'];
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

const KEEP_HOURS = 168;         // how long stories stay in news.json (7 days, for search)
const NEW_WINDOW_HOURS = 30;    // only keep stories newer than this when first seen
const RETRY_HOURS = 12;         // stories that missed AI (limit hit) get retried this long
const PER_FEED = 20;            // newest N per feed
const MAX_AI_ITEMS = 75;        // max headlines sent to AI per run
const AI_BATCH = 25;
// standard keywords so recommendations can match stories
const TAG_VOCAB = ['黄金','白银','油价','令吉','马股','股市','美股','港股','A股','美联储','利率','通胀','汇率','经济','房地产','银行','加密货币',
  '人工智能','芯片','电动车','科技公司','中美关系','中国经济','东盟','新加坡','印尼','泰国','越南','菲律宾','马来西亚政治','国际政治',
  '战争冲突','中东','俄乌','能源','气候','贸易','就业','教育','健康','交通'];           // headlines per AI request
const MAX_SUMMARY = 15;
const MAX_DETAIL = 8;           // max 详细版 (detailed summaries) per run
const DETAIL_BATCH = 4;         // articles per AI request for 详细版         // max stories that get summary + impact per run
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
  return items.slice(0, feed.max || PER_FEED).map((it) => {
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

// ---------- AI ----------
function extractJsonArray(out) {
  const s = out.indexOf('['), e = out.lastIndexOf(']');
  if (s < 0 || e < s) throw new Error('AI reply had no JSON array: ' + out.slice(0, 200));
  return JSON.parse(out.slice(s, e + 1));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function askGemini(prompt) {
  let lastErr;
  for (const model of [...GEMINI_MODELS, GEMINI_MODELS[0]]) { // last entry = one retry of the main model
    if (lastErr && /\b(429|503)\b/.test(lastErr.message)) await sleep(15000);
    console.log(`Trying Gemini ${model}...`);
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 12000 },
        }),
        signal: AbortSignal.timeout(150000),
      });
    } catch (e) { lastErr = new Error(`Gemini ${model}: ${e.message}`); console.log(lastErr.message); continue; }
    if (!res.ok) { lastErr = new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`); console.log(lastErr.message); continue; }
    const data = await res.json();
    const out = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    console.log(`AI: Gemini ${model} answered in ${Math.round((Date.now() - t0) / 1000)}s`);
    return extractJsonArray(out);
  }
  throw lastErr;
}

async function askClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(300000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  console.log(`AI: Claude ${CLAUDE_MODEL}`);
  return extractJsonArray(data.content.map((c) => c.text || '').join(''));
}

// One request does everything: translate, categorise, score, dedupe, and for the
// most important stories write a summary + 3-level impact.
async function aiProcess(items) {
  const list = items.map((x) => ({ id: x.id, t: x.title, s: x.source, d: (x.desc || '').slice(0, 300) }));
  const prompt = `你是给马来西亚华人读者编新闻的编辑。读者关心：财经、国际、东南亚、马来西亚、中国、科技。
下面是新闻列表(JSON，t=标题，s=来源，d=内容摘录)。为每一条输出一个对象：
- id
- zh: 完整的简体中文标题(中文原文就保留原意；英文/马来文就翻译)，不超过32字
- short: 卡片用的短标题，只写重点，最多16个字，像新闻快讯(例：「股币金银齐跌，4.28万亿蒸发」「怕美联储加息，全球股市跌」)
- key: 一句话重点，最多18个字，补充短标题没说的(例：「全球市场全线抛售」)
- cat: ${CATEGORIES.join('|')}|other 之一(娱乐、体育、八卦、社会小事、个别罪案用 other)
- score: 1-5 重要性(5=影响市场/区域/全球的大事，1=琐碎)
- dup: 如果和列表里另一条是同一事件，填较早那条的 id，否则 null
- tags: 1-3 个关键词，尽量从这个清单选：${TAG_VOCAB.join('、')}；清单没有的才自己写(2-4字中文)
另外，只给 score 最高的 ${Math.ceil(MAX_SUMMARY * items.length / MAX_AI_ITEMS)} 条(且 score>=4、cat 不是 other)加上：
- sum: 2-3句简体中文摘要。只根据提供的标题和内容写，不要编造数字、人名或细节；信息不足就写短一点。
- my: 对马来西亚的可能影响(令吉、股市、物价、就业、政策)，1句；没有明显影响填 null
- sea: 对东南亚的可能影响，1句；没有填 null
- world: 对全球的可能影响，1句；没有填 null
全部用简体中文：英文缩写要写成中文(AI→人工智能，Fed→美联储，IPO→首次公开招股，CEO→总裁，GDP→国内生产总值，US→美国，EV→电动车)，公司和人名用常见中文译名；只有没有中文名的才保留英文。
影响是分析不是事实，用"可能"等字眼，不要夸大；没有直接、明确的影响就填 null，宁缺毋滥。
马来西亚常用译名：MCA=马华，MIC=国大党，UMNO=巫统，PH/Pakatan Harapan=希盟，BN=国阵，PAS=伊党，PN=国盟，DAP=行动党，PKR=公正党，Bursa=马股，ringgit=令吉，PRN=州选。

只输出 JSON 数组。
${JSON.stringify(list)}`;
  return PROVIDER === 'gemini' ? askGemini(prompt) : askClaude(prompt);
}

async function aiDetail(batch) {
  const list = batch.map((x) => ({ id: x.id, t: x.zh || x.title, s: x.source, text: x._text }));
  const prompt = `你是给马来西亚华人读者写新闻详细摘要的编辑。下面每条有文章全文(text)。
为每条输出 { id, detail }，detail 是 5-8 个要点的数组(简体中文)，每点 1-2 句：
- 用你自己的话改写，绝对不要大段照抄原文句子
- 包含关键事实：谁、什么、何时、数字、原因、接下来会怎样
- 只写文章里有的内容，不要编造
- 英文/马来文文章也用简体中文写；英文缩写写成中文(AI→人工智能，Fed→美联储，IPO→首次公开招股)
马来西亚常用译名：MCA=马华，MIC=国大党，UMNO=巫统，PH=希盟，BN=国阵，PAS=伊党，PN=国盟，DAP=行动党，PKR=公正党，Bursa=马股，ringgit=令吉。

只输出 JSON 数组。
${JSON.stringify(list)}`;
  return PROVIDER === 'gemini' ? askGemini(prompt) : askClaude(prompt);
}

async function addDetails(items, now) {
  const want = items
    .filter((x) => x.sum && !x.detail && !x.detailTried && Date.parse(x.published) >= now - 24 * 3600e3)
    .sort((a, b) => (b.score ?? 3) - (a.score ?? 3))
    .slice(0, MAX_DETAIL * 2);
  const ready = [];
  for (const x of want) { // one at a time: Google rate-limits parallel link decoding
    try {
      if (x.url.includes('news.google.com')) { x.url = await resolveGoogleNews(x.url); await sleep(1500); }
      x._text = await articleText(x.url);
      ready.push(x);
    } catch (e) {
      console.log(`  no text: ${x.source} (${e.message})`);
    }
    x.detailTried = true;
  }
  const todo = ready.sort((a, b) => (b.score ?? 3) - (a.score ?? 3)).slice(0, MAX_DETAIL);
  for (const x of ready) if (!todo.includes(x)) delete x.detailTried; // try again next run
  console.log(`详细版: ${want.length} tried, ${ready.length} readable, writing ${todo.length}`);
  for (let i = 0; i < todo.length; i += DETAIL_BATCH) {
    const batch = todo.slice(i, i + DETAIL_BATCH);
    try {
      const res = new Map((await aiDetail(batch)).map((r) => [r.id, r]));
      for (const x of batch) {
        const d = res.get(x.id)?.detail;
        if (Array.isArray(d) && d.length >= 3) x.detail = d.slice(0, 8).map(String);
      }
    } catch (e) {
      console.error('详细版 batch failed:', e.message);
      for (const x of batch) delete x.detailTried; // retry next run
    }
  }
  for (const x of items) delete x._text; // never save article text
}

// ---------- main ----------
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
  const seenTitles = new Set(old.items.map((x) => normTitle(x.title)));
  const added = [];
  for (const x of fresh.sort((a, b) => b.published.localeCompare(a.published))) {
    const t = Date.parse(x.published);
    if (known.has(x.id) || t < now - NEW_WINDOW_HOURS * 3600e3 || t > now + 3600e3) continue;
    const nt = normTitle(x.title);
    if (seenTitles.has(nt)) continue;
    seenTitles.add(nt);
    x.fetched = new Date().toISOString();
    added.push(x);
  }
  console.log(`New stories: ${added.length}`);

  let items = [...added, ...old.items];

  // AI: new stories first, then recent ones that missed AI earlier (e.g. limit hit)
  let aiStatus = PROVIDER ? 'ok' : 'off';
  if (PROVIDER) {
    // new stories first, then older AI'd ones still missing the short card title (added in v2)
    const recent = items.filter((x) => Date.parse(x.published) >= now - RETRY_HOURS * 3600e3);
    const todo = [...recent.filter((x) => !x.ai), ...recent.filter((x) => x.ai && !x.short).sort((a, b) => (b.score ?? 3) - (a.score ?? 3))].slice(0, MAX_AI_ITEMS);
    console.log(`Sending ${todo.length} stories to AI (${PROVIDER})`);
    if (todo.length) {
      try {
        const res = new Map();
        for (let i = 0; i < todo.length; i += AI_BATCH) {
          try { for (const r of await aiProcess(todo.slice(i, i + AI_BATCH))) res.set(r.id, r); }
          catch (e) { aiStatus = 'partial'; console.error(`AI batch ${i / AI_BATCH + 1} failed (will retry next run):`, e.message); break; }
        }
        if (!res.size) aiStatus = 'error';
        const drop = new Set();
        for (const x of todo) {
          const r = res.get(x.id);
          if (!r) continue;
          x.ai = true;
          if (r.zh) x.zh = r.zh;
          if (r.cat) x.cat = r.cat;
          if (Array.isArray(r.tags)) x.tags = r.tags.slice(0, 3).map(String);
          if (r.short) x.short = String(r.short).slice(0, 20);
          if (r.key) x.key = String(r.key).slice(0, 24);
          x.score = Number(r.score) || 3;
          if (r.cat === 'other' || (r.dup && r.dup !== x.id)) { drop.add(x.id); continue; }
          if (r.sum) { x.sum = r.sum; x.impact = { my: r.my || null, sea: r.sea || null, world: r.world || null }; }
          delete x.desc;
        }
        items = items.filter((x) => !drop.has(x.id));
        console.log(`AI done: ${res.size} processed, ${drop.size} dropped`);
      } catch (e) {
        aiStatus = 'error';
        console.error('AI step failed, keeping plain headlines (will retry next run):', e.message);
      }
    }
  }

  // 详细版: for top stories, read the article and have AI write 5-8 points in its own words
  if (PROVIDER) await addDetails(items, now);

  await updateGold().catch((e) => console.error('Gold failed:', e.message));

  const cutoffKeep = now - KEEP_HOURS * 3600e3;
  items = items
    .filter((x) => Date.parse(x.published) >= cutoffKeep)
    .map((x) => {
      if (x.score == null) x.score = 3;
      if (!x.sum && x.desc && Date.parse(x.published) < now - RETRY_HOURS * 3600e3) x.sum = x.desc.slice(0, 160);
      return x;
    })
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 1500);

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), ai: PROVIDER, aiStatus, feeds: report, items }, null, 1));
  console.log(`Wrote ${items.length} stories (${added.length} new).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
