/* 乐乐新闻: 合并报道 (大事件 → 分线), pictures, 🔥 热度 and radio-style listening.
   Loaded before app.js; uses app.js helpers at call time. */
'use strict';

let events = { events: [] };
let photos = { tags: {} };
let evStoryMap = new Map(); // story id -> {ev, line|null}

function indexEvents() {
  evStoryMap = new Map();
  for (const ev of events.events || []) {
    if (ev.hidden) continue;
    for (const l of ev.lines || []) for (const id of l.ids) evStoryMap.set(id, { ev, line: l });
    for (const id of ev.minor || []) if (!evStoryMap.has(id)) evStoryMap.set(id, { ev, line: null });
  }
}
const evById = (id) => (events.events || []).find((e) => e.id === id);
const lineById = (lid) => { for (const ev of events.events || []) { const l = (ev.lines || []).find((x) => x.id === lid); if (l) return { ev, l }; } return null; };
const combined = (l) => l.w && !l.loose;
const follows = () => U.get('follow', []);
function activeEvents() {
  const f = new Set(follows());
  return (events.events || []).filter((e) => !e.hidden && (e.lines || []).some(combined) &&
      (f.has(e.id) || Date.now() - Date.parse(e.last) < 36 * 3600e3))
    .sort((a, b) => (f.has(b.id) ? 1 : 0) - (f.has(a.id) ? 1 : 0) || (b.heat?.score || 0) - (a.heat?.score || 0) || b.last.localeCompare(a.last));
}
// stories that are shown inside a 大事件 card (so they don't also appear as separate cards)
function eventStoryIds() {
  const s = new Set();
  for (const ev of activeEvents().slice(0, 3)) for (const l of ev.lines.filter(combined)) l.ids.forEach((id) => s.add(id));
  return s;
}
// a storyline as a story-like object (for 存起来 / 看过 / search)
function lineStory(lid) {
  const r = lineById(lid); if (!r || !r.l.w) return null;
  const { ev, l } = r;
  const n = new Set(l.ids.map((id) => ev.stories[id]?.source)).size;
  return { id: 'ln:' + lid, title: l.w.title, zh: l.w.title, short: l.w.short, key: l.w.key, sum: l.w.summary, url: '', source: `${n} 家媒体`, cat: ev.cat, published: l.at || ev.last, tags: [], ev: ev.id, img: l.img?.src ? l.img : undefined };
}

// ---------- pictures: A news photo → B free photo → C drawing ----------
const C_ICON = {
  finance: '<path d="M6 30 L16 22 L24 26 L36 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 12h6v6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  world: '<circle cx="21" cy="21" r="13" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M8 21h26M21 8c-5 4-5 22 0 26M21 8c5 4 5 22 0 26" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  sea: '<path d="M6 28c4-3 8-3 12 0s8 3 12 0 6-2 6-2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M14 22V10l10 6-10 6" fill="currentColor"/>',
  malaysia: '<path d="M21 6l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L11 13.5l7-.5z" fill="currentColor"/><path d="M8 32h26" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  china: '<path d="M9 34V16l12-8 12 8v18M15 34V22h12v12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>',
  tech: '<rect x="11" y="11" width="20" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M16 6v5M21 6v5M26 6v5M16 31v5M21 31v5M26 31v5M6 16h5M6 21h5M6 26h5M31 16h5M31 21h5M31 26h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};
function drawnPic(cat, cls = 'pic') {
  const c = CAT_COLOR[cat] || '#5c6069';
  return `<span class="${cls} drawn" style="background:${c}17;color:${c}"><svg viewBox="0 0 42 42" aria-hidden="true">${C_ICON[cat] || C_ICON.world}</svg><b>${esc(CATS[cat] || '新闻')}</b></span>`;
}
function picOf(x) {
  if (x.img?.src) return x.img;
  if (x.img?.people?.length) return x.img;
  for (const t of x.tags || []) { const p = photos.tags?.[t]; if (p?.src) return { src: p.src, credit: p.credit, kind: 'B' }; }
  return null;
}
function imgTag(p, cat, cls) {
  if (p.people?.length) {
    return `<span class="${cls} people">${p.people.slice(0, 2).map((q) => `<img src="${esc(q.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="picFail(this,'${cat}')">`).join('')}</span>`;
  }
  return `<img class="${cls}" src="${esc(p.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="picFail(this,'${cat}')">`;
}
function creditOf(p) {
  if (!p) return '图：乐乐新闻绘制';
  if (p.people?.length) return '图：' + [...new Set(p.people.map((q) => q.credit))].join('；');
  return '图：' + p.credit;
}
// small picture for cards (with a tiny credit line)
function thumbHtml(x) {
  const p = picOf(x);
  return `<span class="thumb-wrap">${p ? imgTag(p, x.cat, 'pic') : drawnPic(x.cat)}<span class="credit">${esc(creditOf(p).replace(/ · Wikimedia Commons · .*/, ' · Wikimedia'))}</span></span>`;
}
// big picture (reader, event page)
function heroPic(x, cls = 'hero-pic') {
  const p = picOf(x);
  return `<figure class="${cls}">${p ? imgTag(p, x.cat, 'big') : drawnPic(x.cat, 'big')}<figcaption>${esc(creditOf(p))}</figcaption></figure>`;
}
window.picFail = (img, cat) => {
  const wrap = img.closest('.people') || img;
  const cap = wrap.parentElement?.querySelector('.credit, figcaption');
  if (cap) cap.textContent = '图：乐乐新闻绘制'; // the picture didn't load: show our drawing and credit it correctly
  const tmp = document.createElement('span'); tmp.innerHTML = drawnPic(cat, wrap.classList.contains('big') ? 'big' : 'pic');
  wrap.replaceWith(tmp.firstChild);
};

// ---------- 🔥 热度 ----------
const flames = (n) => '🔥'.repeat(Math.max(1, n || 1));
function heatBadge(ev) {
  return `<span class="bd o">${flames(ev.heat?.score)} 热度</span>`;
}
function fmtViews(n) { return n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万' : String(n); }
function heatCard(ev) {
  const h = ev.heat || {};
  return `<div class="heat-card"><div class="row"><b>${flames(h.score)} 热度 ${h.score || 1}/5</b><button class="more-btn" data-action="heat-info" data-ev="${ev.id}">怎么算？ⓘ</button></div>
    <div class="heat-grid">
      <div><b>${h.sources || '-'}</b><span>家媒体报道</span></div>
      <div><b>${h.gdelt ? `${h.gdelt.ratio >= 1 ? '↑' : '↓'} ${h.gdelt.ratio} 倍` : '—'}</b><span>全球报道量</span></div>
      <div><b>${h.wiki ? fmtViews(h.wiki.views) : '—'}</b><span>人查维基百科</span></div>
    </div></div>`;
}
function heatInfo(evId) {
  const ev = evById(evId); const h = ev?.heat || {};
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <p style="font-size:1.2rem;font-weight:900;margin-bottom:.3rem">🔥 热度怎么算？</p>
    <p class="note" style="margin:0 0 .8rem">新闻网站不公开「多少人看过」，所以我们用 3 个看得到、查得到的数字：</p>
    <div class="pt"><span class="n">1</span><span><b>${h.sources || '-'} 家媒体报道</b><br><span class="note">我们的新闻来源里，有几家报道这件事</span></span></div>
    <div class="pt"><span class="n">2</span><span><b>全球报道量 ${h.gdelt ? `${h.gdelt.ratio} 倍` : '（暂时没有资料）'}</b><br><span class="note">全世界 65 种语言的新闻里，过去 24 小时提到这件事的，是前一周平均的几倍（GDELT 免费资料库）</span></span></div>
    <div class="pt"><span class="n">3</span><span><b>${h.wiki ? `${fmtViews(h.wiki.views)} 人查维基百科` : '维基百科（没有相关条目）'}</b><br><span class="note">${h.wiki ? `昨天有多少人打开「${esc(h.wiki.title)}」维基页，是平时的 ${h.wiki.ratio ?? '-'} 倍（维基官方统计）` : '小新闻可能没有维基页，就只看前两个'}</span></span></div>
    <p class="note" style="margin:.6rem 0 0">三个一起算成 1–5 级。🔥🔥🔥🔥🔥 = 全世界都在报、很多人在查。</p>
    <div class="onb-nav" style="margin-top:1rem"><button class="next" data-m="ok">知道了</button></div></div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-m]')) m.hidden = true; };
  track('heat_info', null, { event: ev?.name });
}

// ---------- cards ----------
function eventCard(ev, big = true) {
  const lines = ev.lines.filter(combined);
  const views = lines.some((l) => l.w.views?.length);
  const followed = follows().includes(ev.id);
  return `<article class="card ev-card" data-ev="${ev.id}">
    ${big ? heroPic({ cat: ev.cat, img: ev.img }, 'ev-pic') : ''}
    <div class="meta"><span class="tag">📌 大事件 · ${CATS[ev.cat] || ''}</span><span>${ago(ev.last)}更新</span>${followed ? '<span class="tag">· 已追踪</span>' : ''}</div>
    <h2 role="button" tabindex="0" data-action="open-event" data-ev="${ev.id}">${esc(ev.name)}</h2>
    <p class="key">${esc(ev.short || ev.key || '')}</p>
    <div class="badges">${heatBadge(ev)}<span class="bd">📰 ${ev.heat?.sources || '-'} 家媒体 · ${Object.keys(ev.stories).length} 则</span>${views ? '<span class="bd v">⚖️ 有不同说法</span>' : ''}</div>
    <div class="actions"><button class="btn primary" data-action="open-event" data-ev="${ev.id}">${ic('book')}看 ${lines.length} 条分线</button>
      <button class="btn" data-action="listen-event" data-ev="${ev.id}">${ic('headphones')}听</button></div>
  </article>`;
}
function eventsSection() {
  const list = activeEvents().slice(0, 3);
  if (!list.length) return '';
  return `<div class="part-h">📌 大事件 · 多家媒体合并整理</div>${list.map((e, i) => eventCard(e, i === 0)).join('')}`;
}
function eventTiles() {
  const list = activeEvents().slice(0, 5);
  if (!list.length) return '';
  return `<div class="sec-h">📌 大事件 <small>多家媒体合并整理</small></div><div class="hscroll">${list.map((ev) =>
    `<button class="topic-card" data-action="open-event" data-ev="${ev.id}"><b>${esc(ev.name)}</b><span>${flames(ev.heat?.score)} · ${ev.heat?.sources || '-'} 家媒体</span><em>${ev.lines.filter(combined).length} 条分线 ›</em></button>`).join('')}</div>`;
}

// ---------- 大事件 page ----------
let curEvent = null;
function openEvent(id, push = true) {
  const ev = evById(id); if (!ev) { toast('这个大事件已经结束'); return; }
  curEvent = id;
  const el = $('#event');
  const lines = ev.lines.filter(combined);
  const loose = ev.lines.filter((l) => l.w && l.loose);
  const followed = follows().includes(ev.id);
  const minor = (ev.minor || []).map((sid, i) => ({ s: ev.stories[sid], t: ev.minorText?.[i] })).filter((m) => m.s);
  const allStories = Object.values(ev.stories).sort((a, b) => b.published.localeCompare(a.published));
  el.innerHTML = `<div class="wrap ev-page">
    <div class="ov-head"><button class="close" data-action="close-event">${ic('back')}返回</button><h3>📌 大事件</h3>
      <button class="btn ${followed ? 'on' : ''}" data-action="follow" data-ev="${ev.id}">${followed ? '✓ 已追踪' : '＋ 追踪'}</button></div>
    ${heroPic({ cat: ev.cat, img: ev.img })}
    <div class="meta"><span class="tag">${CATS[ev.cat] || ''}</span><span>${new Date(ev.first).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 起 · ${ago(ev.last)}更新</span></div>
    <h1 class="ev-title">${esc(ev.name)}</h1>
    ${heatCard(ev)}
    ${ev.overview ? `<div class="overview"><b>一句话总览</b><p>${esc(ev.overview)}</p></div>` : ''}
    <button class="listen-btn" data-action="listen-event" data-ev="${ev.id}">${ic('headphones')}听整个大事件</button>
    <div class="label">分 ${lines.length} 条线看 · 按重要排</div>
    ${lines.map((l, i) => {
      const n = new Set(l.ids.map((sid) => ev.stories[sid]?.source)).size;
      const x = { cat: ev.cat, img: l.img };
      return `<button class="line-row" data-action="open-line" data-line="${l.id}">${thumbHtml(x)}
        <span class="lr-txt"><span class="meta"><span class="tag">分线 ${i + 1}</span><span>📰 ${n} 家</span>${l.w.views?.length ? '<span class="c-violet" style="font-weight:800">⚖️ 有不同说法</span>' : ''}</span>
        <b>${esc(l.t)}</b><span>${esc(l.w.key || l.w.short || '')}</span></span><span class="chev">${ic('chev')}</span></button>`;
    }).join('')}
    ${loose.length ? `<div class="label">其他相关报道（说法不够一致，没有合并）</div>${loose.flatMap((l) => l.ids.map((sid) => ev.stories[sid]).filter(Boolean)).map((s) => storyRow(s)).join('')}` : ''}
    ${minor.length ? `<div class="label">花絮 · 各 1 家报道，未经他家证实</div><div class="minor">${minor.map((m) => `<button class="minor-row" data-action="open-story" data-id="${m.s.id}" data-ev="${ev.id}">· ${esc(m.t || m.s.zh || m.s.title)} <span class="note">（${esc(m.s.source)}）</span></button>`).join('')}</div>` : ''}
    <button class="btn" style="width:100%;justify-content:center;height:2.8rem;margin-top:1rem" data-action="toggle-all-src">📰 全部 ${allStories.length} 则原文 ▾</button>
    <div class="all-src" hidden>${allStories.map((s) => storyRow(s)).join('')}</div>
    <p class="disclaimer">由 AI 根据多家报道整理，可能有误；以原文为准。</p>
  </div>`;
  el.hidden = false; el.scrollTop = 0; document.body.style.overflow = 'hidden';
  if (push) history.pushState({ ov: 'event' }, '');
  track('event_open', null, { event: ev.name });
}
function storyRow(s) {
  return `<div class="src-row"><span class="src-ic">${esc((s.source || '').slice(0, 2))}</span>
    <span class="src-txt"><b>${esc(s.source)}</b> <span class="note">${ago(s.published)}</span><br><span>${esc(s.zh || s.title)}</span></span>
    <button class="more-btn" data-action="link-raw" data-url="${esc(s.url)}" data-src="${esc(s.source)}">原文↗</button></div>`;
}

// ---------- 分线 page ----------
let curLine = null;
function openLine(lid, push = true) {
  const r = lineById(lid); if (!r || !r.l.w) return;
  const { ev, l } = r; const w = l.w;
  curLine = lid;
  const idx = ev.lines.filter(combined).findIndex((x) => x.id === lid);
  const members = l.ids.map((id) => ev.stories[id]).filter(Boolean);
  const nSrc = new Set(members.map((s) => s.source)).size;
  // reading a storyline counts as reading its stories
  for (const s of members) if (byId.has(s.id)) { const rs = readSet(); if (!rs.has(s.id)) { rs.add(s.id); U.set('read', { [today()]: [...rs] }); } }
  addHist('ln:' + lid, 'detail'); signalTags(ev, 3);
  const links = (ev.links || []).filter((k) => k.from === lid || k.to === lid);
  const sec = (k) => `data-sec="${lid}:${k}"`;
  const el = $('#line');
  el.innerHTML = `<div class="wrap reader line-page">
    <div class="ov-head"><button class="close" data-action="close-line">${ic('back')}返回</button><h3>${esc(ev.name)} · 分线 ${idx + 1}</h3>
      <button class="round" data-action="star" data-id="ln:${lid}" aria-label="存起来" style="${isFav('ln:' + lid) ? 'color:var(--accent);border-color:var(--accent)' : ''}">${ic('bookmark')}</button></div>
    ${heroPic({ cat: ev.cat, img: l.img })}
    <div class="meta"><span class="tag">${esc(l.t)}</span><span>${nSrc} 家媒体 · ${members.length} 则 · ${ago(l.at || ev.last)}整理</span></div>
    <div class="r-title" ${sec('title')}>${esc(w.title)}</div>
    <p class="r-sum" ${sec('sum')}>${esc(w.summary || '')}</p>
    <button class="listen-btn" data-action="listen-line" data-line="${lid}" id="l-listen">${ic('headphones')}听这条分线</button>
    <div class="label">多家都这样说 · 共同重点</div>
    <ol ${sec('common')}>${w.common.map((c, i) => `<li><span class="n">${i + 1}</span><span>${esc(c.t)}<span class="cnt">✓ ${c.src.length} 家：${c.src.map(esc).join(' · ')}</span></span></li>`).join('')}</ol>
    ${w.single?.length ? `<div class="label">只有一家说（未经他家证实）</div><ol class="single" ${sec('single')}>${w.single.map((c) => `<li><span class="n">i</span><span>据 ${esc(Array.isArray(c.src) ? c.src[0] : c.src)}：${esc(c.t)}</span></li>`).join('')}</ol>` : ''}
    ${w.views?.length ? `<div class="label">⚖️ 不同说法 · 两边都给你看</div><div class="views" ${sec('views')}>${w.views.map((v, i) => `<div class="view v${i}"><b>${esc(v.label)} · ${(v.src || []).map(esc).join('、')}</b><span>${esc(v.t)}</span></div>`).join('')}</div>` : ''}
    ${links.length ? `<div class="label">🔗 和其他分线有关</div>${links.map((k) => { const other = lineById(k.from === lid ? k.to : k.from); return other ? `<button class="link-row" data-action="open-line" data-line="${other.l.id}"><span><b>${esc(other.l.t)}</b>：${esc(k.t)}</span>${ic('chev')}</button>` : ''; }).join('')}` : ''}
    ${w.unknown ? `<div class="label">还不知道的</div><p class="r-sum" ${sec('unknown')}>${esc(w.unknown)}</p>` : ''}
    ${w.impact && (w.impact.my || w.impact.sea || w.impact.world) ? `<div class="label">可能的影响</div><div ${sec('impact')}>${impactHtml(w)}</div>` : ''}
    <div class="label">${nSrc} 家来源</div>
    <div class="src-list">${members.map((s) => storyRow({ ...s, zh: s.zh || perOf(w, s)?.t })).join('')}
      <div class="src-btns"><button class="btn" data-action="toggle-per">展开全部原文重点 ▾</button><button class="btn primary" data-action="together" data-line="${lid}">一起读 ${members.length} 篇 ▸</button></div>
      <div class="per" hidden>${members.map((s) => { const p = perOf(w, s); return `<div class="per-row"><b>${esc(s.source)}</b>${p?.view ? ` <span class="bd v">${esc(p.view)}</span>` : ''}<p>${esc(p?.says || s.zh || s.title)}</p></div>`; }).join('')}</div>
    </div>
    <p class="disclaimer">由 AI 根据 ${nSrc} 家报道整理，可能有误；以原文为准。</p>
  </div>`;
  el.hidden = false; el.scrollTop = 0; document.body.style.overflow = 'hidden';
  if (push) history.pushState({ ov: 'line' }, '');
  track('line_open', null, { event: ev.name, line: l.t });
}
function perOf(w, s) { return (w.per || []).find((p) => p.id === s.id); }
function signalTags(ev, delta) { // interests from a storyline: use its stories' tags
  const first = Object.values(ev.stories).map((s) => byId.get(s.id)).find(Boolean);
  if (first) signal(first.id, delta, true);
}

// ---------- 一起读 ----------
let togetherIdx = 0;
function openTogether(lid, i = 0, push = true) {
  const r = lineById(lid); if (!r) return;
  const { ev, l } = r; const w = l.w;
  const members = l.ids.map((id) => ev.stories[id]).filter(Boolean);
  togetherIdx = Math.max(0, Math.min(members.length - 1, i));
  const s = members[togetherIdx]; const p = perOf(w, s);
  const el = $('#together');
  el.innerHTML = `<div class="wrap">
    <div class="ov-head"><button class="close" data-action="close-together">${ic('back')}返回</button><h3>一起读 · ${esc(l.t)}</h3><span class="note">${togetherIdx + 1} / ${members.length}</span></div>
    <div class="steps">${members.map((_, k) => `<i class="${k <= togetherIdx ? 'on' : ''}"></i>`).join('')}</div>
    <div class="card tg-card">
      <div class="tg-src"><span class="src-ic big">${esc(s.source.slice(0, 2))}</span><div><b>${esc(s.source)}</b><div class="note">${new Date(s.published).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div></div></div>
      <div class="r-title" style="font-size:1.2rem">${esc(s.zh || p?.t || s.title)}</div>
      ${(s.zh || p?.t) && (s.zh || p?.t) !== s.title ? `<div class="note">原标题：${esc(s.title)}</div>` : ''}
      <div class="label">这家说</div><p class="r-sum">${esc(p?.says || s.sum || '（这家的重点还在整理）')}</p>
      ${p?.same?.length ? `<div class="label">和别家一样</div><div class="badges">${p.same.map((t) => `<span class="bd g">✓ ${esc(t)}</span>`).join('')}</div>` : ''}
      ${p?.view ? `<div class="label">这家的看法</div><div class="badges"><span class="bd v">${esc(p.view)}${(() => { const v = (w.views || []).find((x) => x.label === p.view); return v ? '：' + esc(v.t) : ''; })()}</span></div>` : ''}
      <div class="tg-btns"><button class="btn" data-action="listen-text" data-text="${esc(`${s.source}报道。${s.zh || s.title}。${p?.says || ''}`)}">${ic('headphones')}听这篇</button>
        <button class="btn on" data-action="link-raw" data-url="${esc(s.url)}" data-src="${esc(s.source)}">看原文 ↗</button></div>
    </div>
    <div class="tg-nav"><button class="btn" data-action="tg-prev" ${togetherIdx === 0 ? 'disabled' : ''}>◀ 上一篇</button><button class="btn primary" data-action="tg-next" ${togetherIdx === members.length - 1 ? 'disabled' : ''}>下一篇 ▶</button></div>
    <p class="note" style="text-align:center">全文请按「看原文」（版权原因，app 只放每家的重点）</p>
  </div>`;
  el.dataset.line = lid;
  if (el.hidden) { el.hidden = false; document.body.style.overflow = 'hidden'; if (push) history.pushState({ ov: 'together' }, ''); track('together', null, { line: l.t }); }
  el.scrollTop = 0;
}

// ---------- radio-style listening ----------
const LISTEN_MODES = { quick: ['快速', '只听总览和每条分线一句'], std: ['标准', '共同重点、不同说法和影响'], full: ['详细', '全部内容，包括只有一家说的和还不知道的'] };
function chooseListenMode(onPick) {
  const m = $('#modal'); const cur = profile.listenMode || 'std';
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p style="font-weight:900">🎧 怎么听？</p>
    <div class="stack">${Object.entries(LISTEN_MODES).map(([k, [a, b]]) => `<button data-m="${k}" style="height:auto;padding:.7rem 1rem;text-align:left;${k === cur ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}"><b>${a}${k === 'std' ? '（推荐）' : ''}</b><br><span class="note">${b}</span></button>`).join('')}
    <button data-m="cancel" style="border:0;background:none;color:var(--muted)">取消</button></div></div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const k = e.target.closest('[data-m]')?.dataset.m;
    if (e.target === m || k === 'cancel') { m.hidden = true; return; }
    if (k) { m.hidden = true; profile.listenMode = k; saveProfile(); onPick(k); }
  };
}
const end = (t) => String(t || '').replace(/[。.！!？?]?\s*$/, '。');
const srcSay = (src) => (src || []).slice(0, 2).join('和') + ((src || []).length > 2 ? '等' : '');
function lineScript(ev, l, n, mode, next) {
  const w = l.w; const q = []; const title = `分线 ${n} · ${l.t}`;
  const push = (sec, text) => q.push({ line: l.id, sec, text, title: `${title} · ${SEC_NAME[sec] || ''}`, ev: ev.id });
  push('title', `第 ${n} 条线：${l.t}。`);
  if (mode === 'quick') { push('sum', w.key || w.short || w.summary); return q; }
  push('sum', w.summary || '');
  if (w.common?.length) push('common', '多家媒体都报道：' + w.common.slice(0, mode === 'full' ? 6 : 3).map((c) => end(c.t)).join(''));
  if (w.views?.length) push('views', '对这件事，看法不同。' + w.views.map((v) => `${srcSay(v.src)}认为，${end(v.t)}`).join(''));
  if (mode === 'full' && w.single?.length) push('single', '另外，' + w.single.map((c) => `据${Array.isArray(c.src) ? c.src[0] : c.src}报道，${end(c.t)}`).join(''));
  if (mode === 'full' && w.unknown) push('unknown', '目前还不清楚：' + w.unknown);
  const imp = w.impact?.my ? `对马来西亚：${w.impact.my}` : w.impact?.world ? `对全球：${w.impact.world}` : '';
  const link = (ev.links || []).find((k) => k.from === l.id && next && k.to === next.id);
  push('impact', [imp, link ? `说到这里，${end(link.t)}下一条线，我们来听${next.t}。` : ''].filter(Boolean).join(' '));
  return q.filter((i) => i.text.trim());
}
const SEC_NAME = { title: '开始', sum: '总览', common: '共同重点', views: '⚖️ 不同说法', single: '只有一家说', unknown: '还不知道', impact: '影响' };
function buildEventQueue(ev, mode) {
  const lines = ev.lines.filter(combined);
  const q = [{ text: `乐乐新闻大事件：${ev.name}。${ev.overview || ''}`, title: `${ev.name} · 总览`, ev: ev.id, sec: 'intro' }];
  lines.forEach((l, i) => q.push(...lineScript(ev, l, i + 1, mode, lines[i + 1])));
  if (mode !== 'quick' && ev.minorText?.length) q.push({ text: '最后是几则花絮，只有一家报道：' + ev.minorText.slice(0, 4).join('；'), title: `${ev.name} · 花絮`, ev: ev.id, sec: 'minor' });
  q.push({ text: `${ev.name}，就到这里。`, title: ev.name, ev: ev.id, sec: 'end' });
  return q;
}
function listenEvent(id) {
  const ev = evById(id); if (!ev) return;
  chooseListenMode((mode) => { track('listen_event', null, { event: ev.name, mode }); startSpeaking('event', buildEventQueue(ev, mode)); });
}
function listenLine(lid) {
  const r = lineById(lid); if (!r) return;
  if (speakCtx === 'event' && speaking && queue[qi]?.line === lid) { stopSpeaking(); return; }
  const lines = r.ev.lines.filter(combined); const i = lines.findIndex((x) => x.id === lid);
  track('listen_line', null, { line: r.l.t });
  startSpeaking('event', lineScript(r.ev, r.l, i + 1, profile.listenMode === 'quick' ? 'std' : (profile.listenMode || 'std'), null));
}
function highlightEvent(item) {
  document.querySelectorAll('[data-sec].speaking').forEach((e) => e.classList.remove('speaking'));
  if (!item?.line) return;
  const el = document.querySelector(`[data-sec="${item.line}:${item.sec}"]`);
  if (el && !$('#line').hidden) { el.classList.add('speaking'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const b = $('#l-listen'); if (b && curLine === item.line) b.innerHTML = `${ic('headphones')}正在读：${SEC_NAME[item.sec] || ''} · 按一下停止`;
}
// ⏭ = next section; hold ⏭ = next storyline
function jumpLine(delta) {
  const cur = queue[qi]?.line; let i = qi + delta;
  while (i > 0 && i < queue.length - 1 && queue[i].line === cur) i += delta;
  if (delta < 0) { const l = queue[i]?.line; while (i > 0 && queue[i - 1].line === l && l) i--; }
  return Math.max(0, Math.min(queue.length - 1, i));
}
