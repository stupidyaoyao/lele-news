// 合并报道: big events (大事件) split into storylines (分线).
//   大事件 = one big happening covered by ≥3 different sources in ≥4 stories (48-hour window)
//   分线   = stories about the same specific thing; combined only if ≥2 sources AND ≥3 facts match
//   花絮   = related stories that only one source reported (shown as "未经他家证实")
// Each storyline gets: 共同重点 (with which sources said it), 只有一家说, 不同说法 (all views, no verdict),
// 还不知道的, impact, per-source notes (for 一起读), and links to other storylines.
// Events with no new stories for 14 days are hidden from the app but kept (searchable) for 60 days.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { checkPublisherImage, commonsPhoto, personPhoto } from './images.mjs';
import { gdeltRatio, wikiViews, heatScore } from './heat.mjs';

const OUT = new URL('../data/events.json', import.meta.url);
const WINDOW_H = 48, HIDE_DAYS = 14, DROP_DAYS = 60;
const MAX_WRITEUPS = 6;
const WRITE_V = 2;               // bump to rewrite all storylines once (after prompt changes)           // storyline write-ups per run (free AI limits)
const AGENCIES = /reuters|路透|\bap\b|associated press|bernama|afp|法新/i;
const GLOSSARY = '马来西亚常用译名：MCA=马华，MIC=国大党，UMNO=巫统，PH=希盟，BN=国阵，PAS=伊党，PN=国盟，DAP=行动党，PKR=公正党，Bursa=马股，ringgit=令吉。英文缩写写成中文（AI→人工智能，Fed→美联储，IPO→首次公开招股，GDP→国内生产总值，CEO→总裁）。';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hid = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);
const slimStory = (x) => ({ id: x.id, title: x.title, zh: x.zh, short: x.short, url: x.url, source: x.source, cat: x.cat, published: x.published, sum: x.sum, img: x.img });
const distinct = (arr) => [...new Set(arr)];

async function groupStories(items, existing, ask) {
  const list = items.map((x) => `${x.id}|${x.source}|${(x.zh || x.title).slice(0, 60)}`).join('\n');
  const prompt = `你是资深新闻编辑。下面是过去 48 小时的新闻（id|来源|标题）。
找出「大事件」：同一件大事被至少 3 家不同来源、共 4 则以上报道（例如一场峰会、一场选举、战争的新进展、一家大公司的重大事件、一场灾难）。普通的每日股市、汇率、金价报道不算大事件。
每个大事件里，把报道分成「分线」：同一分线 = 讲同一件具体的事（同一个人、同一个动作或决定）。不同角度要分开，例如峰会里的「中日冷场」和「贸易部长会议」是两条分线。
每则新闻最多放进一条分线。和大事件有关、但只有一则的报道，也单独成一条分线。
已有的大事件（如果是同一件事，填它的 ev）：${JSON.stringify(existing)}
输出 JSON 数组，每个大事件：{"ev": 已有id或null, "name": "中文名称，最多10字", "en": "英文搜索词 2-4 个关键词，例如 APEC summit Shenzhen", "wiki": "最相关的英文维基百科条目标题，没有就 null", "cat": "finance|world|sea|malaysia|china|tech", "lines": [{"t": "分线名，中文最多12字，例如「中日：高市遭冷遇」", "ids": ["id"]}]}
最多 8 个大事件，按重要程度排。没有就输出 []。
新闻：
${list}`;
  return ask(prompt);
}

async function writeLine(ev, line, stories, ask) {
  const input = stories.map((s) => ({ id: s.id, s: s.source, t: s.zh || s.title, text: (s._text || [s.sum, ...(s.detail || [])].filter(Boolean).join(' ') || '').slice(0, 2500) }));
  const prompt = `你是资深新闻编辑，要把多家媒体对同一件事的报道，合并成一篇给马来西亚华人读者看的报道。
大事件：${ev.name}；分线：${line.t}
规则：
- 只用报道里有的内容，绝不编造；用你自己的话写；简体中文
- 来源名称只能从这个列表原样复制：${JSON.stringify([...new Set(stories.map((s) => s.source))])}
- common：多家都说的事实，每点必须至少 2 家来源都提到；3-6 点，每点 1 句；src 填所有提到这点的来源
- single：只有一家提到、但重要的说法，最多 3 点，src 填那一家
- views：如果各家对原因、结论或评价有不同看法，列出每种看法：label 用「看法 A」「看法 B」…，src 填持这个看法的来源，t 一句话；没有分歧就 []
- 不要替读者判断哪个看法对
- unknown：目前还不清楚、未确定的事，一句；没有就 null
- impact：my=对马来西亚，sea=对东南亚，world=对全球，各一句；关系不大就 null
- people：报道主角是公众人物的话，给英文全名（最多 2 个），否则 []
- photo：主角不是人时，给一个英文图片搜索词（如 "container port"），否则 null
- per：每家来源一条 {"id", "t": "这家的标题（翻成简体中文）", "says": "这家报道的重点 1-2 句", "same": ["和别家相同的点，每个最多 6 字"], "view": "属于哪个看法的 label，或 null"}
- short：卡片短标题最多 16 字；key：一句重点最多 18 字；title：完整标题；summary：综合摘要 2-3 句
${GLOSSARY}
只输出 JSON 数组，里面一个对象：[{"short","key","title","summary","common":[{"t","src":[]}],"single":[{"t","src"}],"views":[{"label","src":[],"t"}],"unknown","impact":{"my","sea","world"},"people":[],"photo","per":[]}]
报道：
${JSON.stringify(input)}`;
  let res;
  try { res = await ask(prompt); } catch (e) { if (!/JSON/.test(e.message)) throw e; console.log('  JSON error, asking again'); res = await ask(prompt); }
  return res[0];
}
// match the AI's source names to ours (it may write 路透社 for Reuters, or drop "Asia")
const ALIAS = { 路透社: 'reuters', 法新社: 'afp', 南华早报: 'south china morning post', 联合早报: '联合早报', 星洲日报: '星洲', 卫报: 'guardian', 纽约时报: '纽约时报', 马新社: 'bernama', 半岛电视台: 'al jazeera', 日经: 'nikkei' };
function matchSource(name, sources) {
  const n = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (!n) return null;
  const a = ALIAS[name] || ALIAS[String(name).trim()];
  for (const s of sources) {
    const k = s.toLowerCase().replace(/\s+/g, '');
    if (k === n || (n.length >= 3 && k.includes(n)) || (k.length >= 3 && n.includes(k)) || (a && k.includes(a.replace(/\s+/g, '')))) return s;
  }
  return null;
}

async function writeOverview(ev, ask) {
  const lines = ev.lines.filter((l) => l.w).map((l, i) => ({ n: i + 1, id: l.id, t: l.t, summary: l.w.summary, per: (l.w.per || []).map((p) => p.says) }));
  const minor = ev.minor.map((id) => ev.stories[id]).filter(Boolean).map((s) => s.zh || s.title);
  const prompt = `你是资深新闻编辑。大事件「${ev.name}」有以下分线（已合并的报道）和花絮。
输出 JSON 数组，里面一个对象：
{"short": "大事件卡片短标题，最多 16 字", "key": "一句重点，最多 20 字", "overview": "一句话总览，60 字以内，说清楚最重要的几件事",
 "links": [{"from": 分线id, "to": 分线id, "t": "from 那条分线的报道提到了 to 那条分线的什么事，一句"}],
 "photo": "代表这个大事件的英文图片搜索词（地点或物品，例如 Shenzhen skyline），不要人名",
 "minor": ["每则花絮改写成一句简短中文，顺序和输入一样"]}
links 只在报道真的互相提到时才写，最多 4 条。${GLOSSARY}
分线：${JSON.stringify(lines)}
花絮：${JSON.stringify(minor)}`;
  let res;
  try { res = await ask(prompt); } catch (e) { if (!/JSON/.test(e.message)) throw e; res = await ask(prompt); }
  return res[0];
}

export async function updateEvents(items, { ask, readPage, logoSet }) {
  let db = { events: [] };
  try { db = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const now = Date.now();
  const byId = new Map(items.map((x) => [x.id, x]));
  const cands = items
    .filter((x) => x.ai && x.cat !== 'other' && Date.parse(x.published) >= now - WINDOW_H * 3600e3)
    .sort((a, b) => (b.score ?? 3) - (a.score ?? 3) || b.published.localeCompare(a.published))
    .slice(0, 260);
  const existing = db.events.filter((e) => now - Date.parse(e.last) < 7 * 864e5).map((e) => ({ ev: e.id, name: e.name }));

  let groups = [];
  try { groups = await groupStories(cands, existing, ask); }
  catch (e) { console.error('Events: grouping failed (keep old events):', e.message); groups = null; }

  if (groups) {
    const used = new Set();
    for (const g of groups) {
      const claimed = new Set(); // a story goes into the first line that lists it
      const lines = (g.lines || []).map((l) => {
        const ids = distinct((l.ids || []).filter((id) => byId.has(id) && !used.has(id) && !claimed.has(id)));
        ids.forEach((id) => claimed.add(id));
        return { t: String(l.t || '').slice(0, 20), ids };
      }).filter((l) => l.ids.length);
      const all = lines.flatMap((l) => l.ids);
      const srcs = distinct(all.map((id) => byId.get(id).source));
      if (all.length < 4 || srcs.length < 3) continue; // not big enough
      all.forEach((id) => used.add(id));
      // same event as before? by the AI's ev id, or by shared stories
      let ev = db.events.find((e) => e.id === g.ev) || db.events.find((e) => all.filter((id) => e.stories?.[id]).length >= 2);
      if (!ev) {
        ev = { id: hid(String(g.name) + now), first: new Date().toISOString(), lines: [], minor: [], stories: {} };
        db.events.push(ev);
        console.log(`Events: new 大事件 「${g.name}」`);
      }
      Object.assign(ev, { name: String(g.name || ev.name).slice(0, 14), en: g.en || ev.en, wiki: g.wiki || ev.wiki || null, cat: g.cat || ev.cat || 'world' });
      const newIds = all.filter((id) => !ev.stories[id]);
      for (const id of all) ev.stories[id] = slimStory(byId.get(id));
      if (newIds.length) ev.last = new Date().toISOString();
      ev.last = ev.last || new Date().toISOString();
      ev.hidden = false;
      // storylines: 2+ sources → combined line; 1 source → 花絮
      const minor = new Set(ev.minor);
      for (const l of lines) {
        const lsrc = distinct(l.ids.map((id) => byId.get(id).source));
        if (lsrc.length < 2) { l.ids.forEach((id) => minor.add(id)); continue; }
        l.ids.forEach((id) => minor.delete(id));
        const old = ev.lines.find((o) => !o.fresh && l.ids.filter((id) => o.ids.includes(id)).length >= Math.max(1, Math.min(o.ids.length, l.ids.length) / 2));
        if (old) { old.ids = distinct([...old.ids, ...l.ids]); old.t = l.t || old.t; }
        else ev.lines.push({ id: `${ev.id}-${ev.lines.length + 1}`, t: l.t, ids: l.ids, fresh: true });
      }
      // a story belongs to one line only
      const seen = new Set();
      for (const l of ev.lines) { l.ids = l.ids.filter((id) => !seen.has(id)); l.ids.forEach((id) => seen.add(id)); }
      ev.lines = ev.lines.filter((l) => l.ids.length);
      for (const l of ev.lines) delete l.fresh;
      ev.minor = [...minor].filter((id) => !seen.has(id));
    }
  }

  // write-ups for storylines whose stories changed
  let budget = MAX_WRITEUPS;
  const live = db.events.filter((e) => !e.hidden && now - Date.parse(e.last) < 3 * 864e5);
  const todo = live.flatMap((ev) => ev.lines.map((l) => ({ ev, l })))
    .filter(({ l }) => l.sig !== hid(l.ids.slice().sort().join()) || l.v !== WRITE_V)
    .sort((a, b) => b.l.ids.length - a.l.ids.length);
  const changed = new Set();
  for (const { ev, l } of todo) {
    if (budget-- <= 0) break;
    // read up to 4 articles from different sources (agencies first)
    const members = l.ids.map((id) => byId.get(id) || ev.stories[id]).filter(Boolean)
      .sort((a, b) => (AGENCIES.test(b.source) ? 1 : 0) - (AGENCIES.test(a.source) ? 1 : 0));
    const pick = [], srcSeen = new Set();
    for (const s of members) { if (srcSeen.has(s.source)) continue; srcSeen.add(s.source); pick.push(s); if (pick.length === 4) break; }
    const imgCands = [];
    for (const s of pick) {
      try { const p = await readPage(s); s._text = p.text; if (p.img) imgCands.push({ src: p.img, source: s.source, agency: AGENCIES.test(s.source) }); }
      catch (e) { console.log(`  line text: ${s.source} (${e.message})`); }
    }
    for (const s of members) if (s.img?.kind === 'A' && !imgCands.some((c) => c.src === s.img.src)) imgCands.push({ src: s.img.src, source: s.source, agency: AGENCIES.test(s.source), checked: true });
    try {
      const w = await writeLine(ev, l, members.slice(0, 8), ask);
      const srcNames = distinct(members.map((s) => s.source));
      const fix = (arr) => distinct((Array.isArray(arr) ? arr : [arr]).map((x) => matchSource(x, srcNames)).filter(Boolean));
      w.common = (w.common || []).map((c) => ({ t: c.t, src: fix(c.src) })).filter((c) => c.t && c.src.length >= 2).slice(0, 6);
      w.views = (w.views || []).map((v) => ({ ...v, src: fix(v.src) }));
      w.single = (w.single || []).map((c) => ({ ...c, src: fix(c.src)[0] || (Array.isArray(c.src) ? c.src[0] : c.src) }));
      w.single = (w.single || []).filter((c) => c.t).slice(0, 3);
      w.views = (w.views || []).filter((v) => v.t && (v.src || []).length).slice(0, 3);
      if (w.views.length < 2) w.views = []; // a "difference" needs at least two sides
      l.w = w;
      l.loose = w.common.length < 3; // Frank's rule: fewer than 3 shared facts → not combined
      l.sig = hid(l.ids.slice().sort().join()); l.v = WRITE_V;
      l.at = new Date().toISOString();
      changed.add(ev);
      console.log(`  分线 「${l.t}」: ${members.length} stories, ${srcNames.length} sources, ${w.common.length} shared facts${l.loose ? ' (kept separate)' : ''}`);
      // picture: news photo of that moment → official photo of the people → topic photo
      l.img = null;
      for (const c of imgCands.sort((a, b) => (b.agency ? 1 : 0) - (a.agency ? 1 : 0)).slice(0, 2)) {
        l.img = c.checked ? { src: c.src, credit: c.source, kind: 'A' } : await checkPublisherImage(c.src, { headline: w.title || l.t, source: c.source, logoSet });
        if (l.img) break;
      }
      if (!l.img && w.people?.length) {
        const ps = [];
        for (const n of w.people.slice(0, 2)) { const p = await personPhoto(n); if (p) ps.push(p); }
        if (ps.length) l.img = { kind: 'B', people: ps };
      }
      if (!l.img && w.photo) l.img = await commonsPhoto(w.photo);
    } catch (e) { console.error(`  分线 「${l.t}」 failed:`, e.message); }
    for (const s of members) delete s._text; // never save article text
    await sleep(3000);
  }

  // event overview, links, picture and 热度
  for (const ev of live) {
    if (changed.has(ev) || !ev.overview) {
      try {
        const o = await writeOverview(ev, ask);
        Object.assign(ev, { short: o.short, key: o.key, overview: o.overview, minorText: o.minor || [] });
        const ids = new Set(ev.lines.map((l) => l.id));
        ev.links = (o.links || []).filter((k) => ids.has(k.from) && ids.has(k.to) && k.from !== k.to && k.t).slice(0, 4);
        if (!ev.img || ev.img.kind !== 'A') {
          const a = ev.lines.find((l) => l.img?.kind === 'A' && !l.loose)?.img;
          ev.img = a || (o.photo ? await commonsPhoto(o.photo) : null) || ev.img || null;
        }
        await sleep(3000);
      } catch (e) { console.error(`  总览 「${ev.name}」 failed:`, e.message); }
    }
  }
  for (const ev of live.slice(0, 6)) {
    const sources = distinct(Object.values(ev.stories).map((s) => s.source)).length;
    const gdelt = await gdeltRatio(ev.en); await sleep(6000); // GDELT asks for one request per 5 s
    const wiki = await wikiViews(ev.wiki);
    ev.heat = { score: heatScore(sources, gdelt, wiki), sources, stories: Object.keys(ev.stories).length, gdelt, wiki, at: new Date().toISOString() };
    console.log(`  🔥 「${ev.name}」 ${ev.heat.score}/5 · ${sources} sources · GDELT ×${gdelt?.ratio ?? '-'} · wiki ${wiki?.views ?? '-'}`);
  }

  // hide after 14 quiet days, drop after 60
  for (const ev of db.events) ev.hidden = now - Date.parse(ev.last) > HIDE_DAYS * 864e5;
  db.events = db.events.filter((ev) => now - Date.parse(ev.last) < DROP_DAYS * 864e5)
    .sort((a, b) => b.last.localeCompare(a.last));
  db.updated = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(db, null, 1));
  console.log(`Events: ${db.events.filter((e) => !e.hidden).length} shown, ${db.events.length} kept`);
}
