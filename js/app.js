/* 乐乐新闻 Happy News: app logic (v1.1)
   Sections: storage · profile · data · digest · render · reader · link confirm ·
   search · favourites · settings · onboarding · listen · tracking · boot */

'use strict';
const CFG = window.LELE_CONFIG || {};
const CATS = { finance: '财经', world: '国际', sea: '东南亚', malaysia: '马来西亚', china: '中国', tech: '科技' };
const DIGEST_SIZE = 10;
const TZ = 'Asia/Kuala_Lumpur';

// ---------- storage ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateMY = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
const today = () => dateMY();
const yesterday = () => dateMY(Date.now() - 864e5);
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return '刚刚'; if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60); return h < 24 ? `${h} 小时前` : `${Math.round(h / 24)} 天前`;
};
const fmtRM = (n, d = 2) => 'RM' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d });
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }

// ---------- profile ----------
let tab = 'digest';
const DEFAULT_PROFILE = { name: '', size: 'normal', theme: 'auto', topics: ['finance', 'world'], confirmLink: true, rate: 1, onboarded: false };
let profile = { ...DEFAULT_PROFILE, ...LS.get('profile', {}) };
// migrate v1.0 settings
if (!LS.get('profile', null)) { const t = LS.get('topics', null); if (t) profile.topics = t; const r = LS.get('rate', null); if (r) profile.rate = r; }
if (!profile.device) profile.device = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
function saveProfile() { LS.set('profile', profile); applyLook(); }
function applyLook() {
  document.documentElement.dataset.theme = profile.theme;
  document.documentElement.dataset.size = profile.size;
  if (profile.size === 'large' && tab === 'live') tab = 'digest';
}
saveProfile();

// ---------- name rules + owner mode ----------
// Secret: a name of exactly one space = owner (Frank). Owner is never tracked.
const OWNER_KEY = ' ';
const isOwnerKey = (raw) => raw === OWNER_KEY;
function checkName(raw) {
  const n = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!n) return { err: '请输入名字才能登入' };
  if (n.length > 20) return { err: '名字最多 20 个字' };
  if (!/^[\p{Script=Han}A-Za-z0-9 ]+$/u.test(n)) return { err: '名字只能用中文、英文或数字' };
  if (!/[\p{Script=Han}A-Za-z]/u.test(n)) return { err: '名字要有文字，不能只有数字' };
  return { name: n };
}
function enterOwner() {
  profile.owner = true; profile.name = 'Frank'; profile.onboarded = true;
  tq = []; LS.set('tq', tq); saveProfile();
}
function leaveOwner(name) { profile.owner = false; profile.name = name; saveProfile(); }
const PRIVACY_SHORT = '🔒 用名字登入，就能保存你的阅读记录和喜好。我们也会记录大概城市，只用来改进 app。';
const PRIVACY_FULL = '你用名字登入后，我们会帮你记住阅读记录、收藏和喜好，换手机也能找回。我们也会记录大概城市，资料只用来改进 app，不会给外人。';
const privacyHtml = () => `<div class="privacy">${PRIVACY_SHORT} <button class="more-btn" data-action="privacy-more">更多</button><div class="privacy-full" hidden>${PRIVACY_FULL}</div></div>`;

// ---------- data ----------
let data = { items: [] };
let gold = null;
let byId = new Map();
const story = (id) => byId.get(id) || favs()[id] || null;

async function load() {
  try {
    const r = await fetch(`data/news.json?t=${Date.now()}`, { cache: 'no-store' });
    data = await r.json();
    byId = new Map(data.items.map((x) => [x.id, x]));
    const t = new Date(data.updated).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#updated').textContent = `更新于 ${t}`;
    if (!speaking) render();
  } catch (e) {
    $('#updated').textContent = '加载失败，稍后再试';
  }
  try {
    gold = await (await fetch(`data/gold.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    renderGold();
  } catch {}
}

// ---------- read state, streak, likes ----------
function readSet() { return new Set(LS.get('read', {})[today()] || []); }
function markRead(id, on = true) {
  const s = readSet(); const had = s.has(id);
  on ? s.add(id) : s.delete(id);
  LS.set('read', { [today()]: [...s] });
  if (on && !had) track('read', id);
}
function streakNow() {
  const s = LS.get('streak', { last: null, n: 0 });
  return s.last === today() || s.last === yesterday() ? s.n : 0;
}
function finishToday() {
  const s = LS.get('streak', { last: null, n: 0 });
  if (s.last === today()) return;
  LS.set('streak', { last: today(), n: s.last === yesterday() ? s.n + 1 : 1 });
  track('finish', null, { streak: streakNow() });
  renderStreak(); render();
  toast('✅ 今天看完了，明天见！');
}
function renderStreak() { $('#streak').textContent = `🔥 ${streakNow()} 天`; }
const likes = () => LS.get('likes', {});
function setLike(id, v) {
  const l = likes(); l[id] = l[id] === v ? 0 : v; if (!l[id]) delete l[id]; LS.set('likes', l);
  track(l[id] === 1 ? 'like' : l[id] === -1 ? 'dislike' : 'unlike', id);
}

// ---------- favourites (copy of the story so it never expires) ----------
const favs = () => LS.get('favs', {});
const isFav = (id) => Boolean(favs()[id]);
function toggleFav(id) {
  const f = favs(); const x = story(id); if (!x) return;
  if (f[id]) { delete f[id]; track('unstar', id); toast('已取消收藏'); }
  else {
    f[id] = slim(x); f[id].savedAt = new Date().toISOString();
    track('star', id, { story: f[id] }); toast('⭐ 已收藏');
  }
  LS.set('favs', f);
}
function slim(x) {
  const { id, title, zh, url, source, cat, published, sum, impact, detail, tags } = x;
  return { id, title, zh, url, source, cat, published, sum, impact, detail, tags };
}

// ---------- digest (locked for the day once AI-processed) ----------
function digestItems() {
  const key = `${today()}|${[...profile.topics].sort().join(',')}`;
  const saved = LS.get('digest', null);
  if (saved && saved.key === key && saved.ready) {
    const list = saved.ids.map((id) => byId.get(id)).filter(Boolean);
    if (list.length >= Math.min(DIGEST_SIZE, saved.ids.length)) return list;
  }
  const since = Date.now() - 24 * 3600e3;
  const pool = data.items.filter((x) => profile.topics.includes(x.cat) && Date.parse(x.published) >= since);
  pool.sort((a, b) => (b.ai ? 1 : 0) - (a.ai ? 1 : 0) || (b.score ?? 3) - (a.score ?? 3) || (b.detail ? 1 : 0) - (a.detail ? 1 : 0) || (b.impact ? 1 : 0) - (a.impact ? 1 : 0) || b.published.localeCompare(a.published));
  const per = {}, pick = [];
  const cap = Math.max(4, Math.ceil(DIGEST_SIZE / profile.topics.length));
  for (const x of pool) { if ((per[x.cat] = (per[x.cat] || 0) + 1) <= cap) pick.push(x); if (pick.length === DIGEST_SIZE) break; }
  for (const x of pool) { if (pick.length >= DIGEST_SIZE) break; if (!pick.includes(x)) pick.push(x); }
  const ready = pick.length >= 5 && pick.filter((x) => x.ai).length >= pick.length * 0.8;
  if (pick.length) LS.set('digest', { key, ids: pick.map((x) => x.id), ready });
  return pick;
}

// ---------- render: gold ----------
let goldOpen = false;
function spark(points) {
  if (!points || points.length < 2) return '';
  const v = points.map((p) => p.g999); const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const d = v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * 100).toFixed(1)},${(28 - (y - min) / r * 24).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="近7天走势"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderGold() {
  const el = $('#gold');
  if (!gold || (!gold.spot && !gold.kijang)) { el.hidden = true; return; }
  el.hidden = false;
  const s = gold.spot;
  const chg = s && s.changePct != null
    ? `<span class="chg ${s.changePct >= 0 ? 'up' : 'down'}">${s.changePct >= 0 ? '▲' : '▼'} ${Math.abs(s.changePct)}%</span>` : '';
  const k = gold.kijang;
  const asOf = s?.asOf ? new Date(s.asOf).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  el.innerHTML = `
    <button class="gold-row" data-action="gold-toggle" aria-expanded="${goldOpen}">
      <span class="gold-label">💰 金价</span>
      ${s ? `<span class="gold-main">${fmtRM(s.g999)}<small>/克 999</small></span> ${chg}
             <span class="gold-sec">916：${fmtRM(s.g916)}/克</span>` : `<span class="gold-sec">Kijang Emas 1oz 卖 ${fmtRM(k.oz.sell, 0)}</span>`}
      <span class="caret">${goldOpen ? '收起 ▲' : '更多 ▼'}</span>
    </button>
    ${goldOpen ? `<div class="gold-more">
      ${gold.trend?.length > 1 ? `<div class="note">近7天走势（999，每克）</div>${spark(gold.trend)}` : ''}
      <table>
        ${s ? `<tr><td>999 每克</td><td>${fmtRM(s.g999)}</td></tr><tr><td>916 每克</td><td>${fmtRM(s.g916)}</td></tr><tr><td>每盎司 (31.1克)</td><td>${fmtRM(s.oz, 0)}</td></tr>` : ''}
        ${s?.changeG999 != null ? `<tr><td>比昨天（每克）</td><td class="chg ${s.changeG999 >= 0 ? 'up' : 'down'}">${s.changeG999 >= 0 ? '+' : ''}${s.changeG999.toFixed(2)}</td></tr>` : ''}
        ${k ? `<tr><td>Kijang Emas 1oz 卖出</td><td>${fmtRM(k.oz.sell, 0)}</td></tr><tr><td>Kijang Emas 1oz 买入</td><td>${fmtRM(k.oz.buy, 0)}</td></tr>` : ''}
      </table>
      <div class="gold-note">国际金价参考${asOf ? `（${asOf}）` : ''}${k ? `；Kijang Emas 为国家银行 ${esc(k.date)} 牌价` : ''}。金铺价格会更高（另加工钱）。</div>
    </div>` : ''}`;
}

// ---------- render: main ----------
function renderChips() {
  $('#chips').innerHTML = Object.entries(CATS).map(([k, v]) =>
    `<button class="chip ${profile.topics.includes(k) ? 'on' : ''}" data-action="topic" data-cat="${k}">${v}</button>`).join('');
}
function renderTabs() { document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab)); }

function impactHtml(x) {
  if (!x.impact || !(x.impact.my || x.impact.sea || x.impact.world)) return '';
  return `<div class="impact">
    ${x.impact.my ? `<div><b>🇲🇾</b><span>${esc(x.impact.my)}</span></div>` : ''}
    ${x.impact.sea ? `<div><b>🌏</b><span>${esc(x.impact.sea)}</span></div>` : ''}
    ${x.impact.world ? `<div><b>🌍</b><span>${esc(x.impact.world)}</span></div>` : ''}
  </div>`;
}
function actionsHtml(x, opts = {}) {
  const l = likes()[x.id] || 0; const fav = isFav(x.id); const read = readSet().has(x.id);
  return `<div class="actions">
    ${x.detail && !opts.inReader ? `<button class="btn primary" data-action="detail" data-id="${x.id}">📖 详细版</button>` : ''}
    <button class="btn ${fav ? 'on' : ''}" data-action="star" data-id="${x.id}" aria-label="收藏">${fav ? '⭐ 已收藏' : '☆ 收藏'}</button>
    <button class="btn ${l === 1 ? 'on' : ''}" data-action="like" data-id="${x.id}" aria-label="喜欢">👍</button>
    <button class="btn ${l === -1 ? 'on' : ''}" data-action="dislike" data-id="${x.id}" aria-label="不喜欢">👎</button>
    ${opts.readBtn ? `<span class="spacer"></span><button class="btn ${read ? 'done' : ''}" data-action="read" data-id="${x.id}">${read ? '✓ 已读' : '标为已读'}</button>` : ''}
  </div>
  <button class="link-out" data-action="link" data-id="${x.id}">去新闻网站看 ↗</button>`;
}
function card(x, i, read) {
  return `<article class="card ${read ? 'read' : ''}" id="c-${x.id}" data-id="${x.id}">
    <div class="meta"><span class="tag">${i != null ? `${i + 1} · ` : ''}${CATS[x.cat] || ''}</span><span>${esc(x.source)} · ${ago(x.published)}</span></div>
    <h2 data-action="${x.detail ? 'detail' : 'read'}" data-id="${x.id}">${esc(x.zh || x.title)}</h2>
    ${x.sum ? `<p class="sum">${esc(x.sum)}</p>` : ''}
    ${impactHtml(x)}
    ${actionsHtml(x, { readBtn: true })}
  </article>`;
}

function render() {
  renderTabs();
  const view = $('#view');
  if (tab === 'favs') { renderFavs(view); return; }
  if (!profile.topics.length) { view.innerHTML = `<div class="empty">在上面选至少一个类别</div>`; return; }
  if (tab === 'digest') {
    const list = digestItems(); const read = readSet();
    const n = list.filter((x) => read.has(x.id)).length;
    if (!list.length) { view.innerHTML = `<div class="empty">过去24小时还没有这些类别的新闻</div>`; return; }
    const finished = LS.get('streak', {}).last === today();
    view.innerHTML = `
      <div class="progress"><span>已读 ${n}/${list.length}</span><div class="bar"><i style="width:${n / list.length * 100}%"></i></div></div>
      ${list.map((x, i) => card(x, i, read.has(x.id))).join('')}
      <div class="done-box ${finished ? 'finished' : ''}">${finished ? '✅ 今天看完了，明天见！' : '<button class="big" data-action="finish">今天看完了 ✅</button>'}</div>`;
  } else {
    const since = Date.now() - 6 * 3600e3;
    const list = data.items.filter((x) => profile.topics.includes(x.cat) && Date.parse(x.published) >= since).slice(0, 60);
    view.innerHTML = list.length ? list.map(liveRow).join('') : `<div class="empty">过去6小时没有新的新闻</div>`;
  }
}
function liveRow(x, q) {
  const hl = (s) => q ? esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`) : esc(s);
  return `<button class="live" data-action="open" data-id="${x.id}">
    <div class="meta"><span class="tag">${CATS[x.cat] || ''}</span><span>${esc(x.source)} · ${ago(x.published)}</span>${x.detail ? '<span>📖</span>' : ''}${isFav(x.id) ? '<span>⭐</span>' : ''}</div>
    <div class="t">${hl(x.zh || x.title)}</div>
  </button>`;
}
function renderFavs(view) {
  const list = Object.values(favs()).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  view.innerHTML = list.length
    ? `<div class="count">共 ${list.length} 条收藏 · 在 🔍 里也能搜到</div>${list.map(liveRow).join('')}`
    : `<div class="empty">还没有收藏。<br>看到喜欢的新闻，按 ☆ 收藏 就会存在这里。</div>`;
}

// ---------- reader (详细版) ----------
function openReader(id) {
  const x = story(id); if (!x) return;
  markRead(id);
  track(x.detail ? 'detail' : 'open', id);
  const el = $('#reader');
  el.innerHTML = `<div class="wrap reader">
    <div class="ov-head"><h3>${x.detail ? '📖 详细版' : '新闻'}</h3><button class="close" data-action="close-reader">✕ 关闭</button></div>
    <div class="meta"><span class="tag">${CATS[x.cat] || ''}</span><span>${esc(x.source)} · ${ago(x.published)}</span></div>
    <h2>${esc(x.zh || x.title)}</h2>
    ${x.zh && x.zh !== x.title ? `<div class="note">原标题：${esc(x.title)}</div>` : ''}
    ${x.detail ? `<div class="label">重点</div><ol>${x.detail.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`
      : x.sum ? `<div class="label">摘要</div><p class="sum">${esc(x.sum)}</p>` : `<p class="note">这条新闻暂时没有摘要。</p>`}
    ${x.impact ? `<div class="label">可能的影响</div>${impactHtml(x)}` : ''}
    <div id="reader-actions">${actionsHtml(x, { inReader: true })}</div>
    <p class="disclaimer">重点和影响由 AI 根据原文整理，可能有误；以原文为准。</p>
  </div>`;
  el.hidden = false; el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  history.pushState({ ov: 'reader' }, '');
}
function closeOverlay(id) {
  const el = $(id); if (el.hidden) return;
  el.hidden = true;
  if ([...document.querySelectorAll('.overlay')].every((o) => o.hidden)) document.body.style.overflow = '';
  if (id !== '#onboarding') render();
}

// ---------- link confirm ----------
function openLink(id) {
  const x = story(id); if (!x) return;
  if (!profile.confirmLink) { go(); return; }
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <p>即将打开《${esc(x.source)}》网站，可能需要几秒钟加载。要打开吗？</p>
    <label><input type="checkbox" id="noask"> 不再提醒</label>
    <div class="onb-nav"><button data-action="modal-cancel">取消</button><button class="next" data-action="modal-go">打开</button></div>
  </div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (e.target === m || a === 'modal-cancel') { m.hidden = true; }
    if (a === 'modal-go') {
      if ($('#noask').checked) { profile.confirmLink = false; saveProfile(); }
      m.hidden = true; go();
    }
  };
  function go() { track('link', id); window.open(x.url, '_blank', 'noopener'); }
}

// ---------- search ----------
// Chinese <-> English/Malay keywords so 黄金 also finds "gold" headlines not yet translated
const SYN = [
  ['黄金', '金价', 'gold', 'emas'], ['白银', 'silver'], ['令吉', '马币', 'ringgit', 'myr'], ['油价', '原油', 'oil', 'crude', 'brent', 'minyak'],
  ['马股', '大马股市', 'bursa', 'klci'], ['股市', '股票', 'stock', 'shares', 'saham'], ['美联储', 'fed', 'federal reserve'],
  ['利率', 'interest rate', 'rate hike', 'rate cut', 'opr'], ['通胀', 'inflation'], ['美元', 'dollar', 'usd'],
  ['中国', 'china', 'beijing'], ['美国', 'u.s.', 'united states', 'washington'], ['新加坡', 'singapore'], ['印尼', 'indonesia'],
  ['泰国', 'thailand'], ['越南', 'vietnam'], ['菲律宾', 'philippines'], ['东盟', 'asean'], ['人工智能', 'ai'], ['芯片', 'chip', 'semiconductor'],
  ['房地产', '房产', 'property', 'real estate'], ['比特币', '加密货币', 'bitcoin', 'crypto'], ['安华', 'anwar'], ['特朗普', 'trump'],
];
function expand(q) {
  const out = new Set([q]);
  for (const g of SYN) if (g.some((w) => w === q || (/[^\x00-\x7f]/.test(q) && q.length >= 2 && w.includes(q)) || (q.length >= 4 && w.startsWith(q)))) g.forEach((w) => out.add(w));
  return [...out];
}
const sState = { q: '', sort: 'new', date: 'all', cat: 'all', src: 'all' };
function openSearch() {
  const el = $('#search');
  const sources = [...new Set(data.items.map((x) => x.source))].sort();
  el.innerHTML = `<div class="wrap">
    <div class="ov-head"><h3>🔍 搜索新闻</h3><button class="close" data-action="close-search">✕ 关闭</button></div>
    <div class="search-box"><input id="sq" type="search" placeholder="例如：黄金、令吉、美联储" value="${esc(sState.q)}" enterkeyhint="search" autocomplete="off"></div>
    <div class="filters">
      <select id="ssort" aria-label="排序"><option value="new">最新</option><option value="top">最重要</option></select>
      <select id="sdate" aria-label="日期"><option value="all">全部日期</option><option value="today">今天</option><option value="yday">昨天</option><option value="older">更早</option></select>
      <select id="scat" aria-label="类别"><option value="all">全部类别</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}<option value="fav">⭐ 我的收藏</option></select>
      <select id="ssrc" aria-label="来源"><option value="all">全部来源</option>${sources.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
    </div>
    <div id="sres"></div>
  </div>`;
  for (const [id, k] of [['ssort', 'sort'], ['sdate', 'date'], ['scat', 'cat'], ['ssrc', 'src']]) {
    const s = el.querySelector('#' + id); s.value = sState[k];
    s.onchange = () => { sState[k] = s.value; runSearch(); };
  }
  const input = el.querySelector('#sq');
  let t; input.oninput = () => { sState.q = input.value.trim(); clearTimeout(t); t = setTimeout(runSearch, 150); };
  input.onchange = () => { if (sState.q.length >= 2) track('search', null, { q: sState.q }); };
  el.hidden = false; document.body.style.overflow = 'hidden';
  history.pushState({ ov: 'search' }, '');
  runSearch(); setTimeout(() => input.focus(), 50);
}
function runSearch() {
  const { q, sort, date, cat, src } = sState;
  const all = new Map(data.items.map((x) => [x.id, x]));
  for (const f of Object.values(favs())) if (!all.has(f.id)) all.set(f.id, f);
  const ql = q.toLowerCase(); const terms = ql ? expand(ql) : [];
  const t0 = today(), t1 = yesterday();
  let list = [...all.values()].filter((x) => {
    if (cat === 'fav' ? !isFav(x.id) : cat !== 'all' && x.cat !== cat) return false;
    if (src !== 'all' && x.source !== src) return false;
    const d = dateMY(Date.parse(x.published));
    if (date === 'today' && d !== t0) return false;
    if (date === 'yday' && d !== t1) return false;
    if (date === 'older' && (d === t0 || d === t1)) return false;
    if (!ql) return true;
    const hay = [x.zh, x.title, x.sum, x.source, ...(x.tags || []), ...(x.detail || [])].filter(Boolean).join(' ').toLowerCase();
    return terms.some((t) => t.length <= 3 && /^[a-z.]+$/.test(t) ? new RegExp(`\\b${t.replace('.', '\\.')}\\b`).test(hay) : hay.includes(t));
  });
  list.sort(sort === 'top' ? (a, b) => (b.score ?? 3) - (a.score ?? 3) || b.published.localeCompare(a.published) : (a, b) => b.published.localeCompare(a.published));
  const shown = list.slice(0, 80);
  $('#sres').innerHTML = `<div class="count">找到 ${list.length} 条${list.length > 80 ? '（显示前80条）' : ''}</div>` +
    (shown.length ? shown.map((x) => liveRow(x, q)).join('') : `<div class="empty">没有找到相关新闻</div>`);
}

// ---------- settings ----------
function openSettings() {
  const el = $('#settings');
  el.innerHTML = `<div class="wrap">
    <div class="ov-head"><h3>⚙️ 设置</h3><button class="close" data-action="close-settings">✕ 完成</button></div>
    <div class="set-group"><h4>你的名字</h4>
      <input class="field" id="setname" value="${esc(profile.name)}" maxlength="20" placeholder="你的名字或称呼" autocomplete="off">
      ${profile.owner ? '<p class="note">👑 管理员模式：你的使用不会被记录。改成别的名字就会离开管理员模式。</p>' : ''}
      <div class="err" id="nameerr" hidden></div></div>
    <div class="set-group"><h4>字体大小</h4><div class="seg">
      <button data-set="size" data-v="normal" class="${profile.size === 'normal' ? 'on' : ''}">标准</button>
      <button data-set="size" data-v="large" class="${profile.size === 'large' ? 'on' : ''}">大字模式（长辈）</button></div>
      <p class="note">大字模式：字更大、按钮更大，隐藏「即时」让画面更简单。</p></div>
    <div class="set-group"><h4>颜色</h4><div class="seg">
      <button data-set="theme" data-v="light" class="${profile.theme === 'light' ? 'on' : ''}">☀️ 白色</button>
      <button data-set="theme" data-v="dark" class="${profile.theme === 'dark' ? 'on' : ''}">🌙 黑色</button>
      <button data-set="theme" data-v="auto" class="${profile.theme === 'auto' ? 'on' : ''}">📱 跟手机</button></div></div>
    <div class="set-group"><h4>想看的类别</h4><div class="chips" style="flex-wrap:wrap;padding:0">
      ${Object.entries(CATS).map(([k, v]) => `<button class="chip ${profile.topics.includes(k) ? 'on' : ''}" data-action="topic" data-cat="${k}">${v}</button>`).join('')}</div></div>
    <div class="set-group"><h4>收听速度</h4><div class="seg">
      ${[0.85, 1, 1.25, 1.5].map((r) => `<button data-set="rate" data-v="${r}" class="${profile.rate === r ? 'on' : ''}">${r}x</button>`).join('')}</div></div>
    <div class="set-group"><div class="row"><h4 style="margin:0">打开新闻网站前先提醒</h4>
      <div class="seg" style="flex:none"><button data-set="confirmLink" data-v="1" class="${profile.confirmLink ? 'on' : ''}">开</button><button data-set="confirmLink" data-v="0" class="${!profile.confirmLink ? 'on' : ''}">关</button></div></div></div>
    <div class="set-group"><button class="btn" data-action="replay-guide">↻ 重新看导览</button>
      ${privacyHtml()}
      <p class="note">乐乐新闻 v${esc(CFG.version || '')} · 新闻来自各大媒体，摘要由 AI 整理</p></div>
  </div>`;
  el.hidden = false; document.body.style.overflow = 'hidden';
  history.pushState({ ov: 'settings' }, '');
  const ni = el.querySelector('#setname'); ni.oninput = () => liveNameCheck(ni, el.querySelector('#nameerr'));
  el.onclick = (e) => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const k = b.dataset.set; let v = b.dataset.v;
    if (k === 'rate') v = Number(v); if (k === 'confirmLink') v = v === '1';
    profile[k] = v; saveProfile(); track('settings', null, { [k]: v });
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (k === 'rate') $('#speed').textContent = `${v}x`;
  };
}
function saveSettingsName() {
  const input = $('#setname'); if (!input) return true;
  const raw = input.value;
  if (isOwnerKey(raw)) { if (!profile.owner) { enterOwner(); toast('👋 管理员模式（不记录）'); } return true; }
  const c = checkName(raw);
  if (c.err) { const e = $('#nameerr'); e.textContent = c.err; e.hidden = false; input.focus(); return false; }
  if (profile.owner && c.name === 'Frank') return true; // still owner
  if (c.name !== profile.name || profile.owner) {
    const wasOwner = profile.owner; leaveOwner(c.name);
    track(wasOwner ? 'name_set' : 'rename', null, { name: c.name }); syncFavs();
  }
  return true;
}
// live hint while typing; a single space (owner key) shows nothing so the secret isn't revealed
function liveNameCheck(input, errEl) {
  const raw = input.value;
  if (!raw || isOwnerKey(raw)) { errEl.hidden = true; return; }
  const c = checkName(raw);
  errEl.textContent = c.err || ''; errEl.hidden = !c.err || c.err === '请输入名字才能登入';
}

// ---------- onboarding ----------
let onbStep = 0;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function openOnboarding(step = 0) {
  onbStep = step; $('#onboarding').hidden = false; document.body.style.overflow = 'hidden'; renderOnb();
}
function renderOnb() {
  const el = $('#onboarding');
  const dots = `<div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === onbStep ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (nextLabel = '下一步', canBack = true) => `<div class="onb-nav">
    ${canBack && onbStep > 0 ? '<button data-onb="back">上一步</button>' : ''}
    <button class="next" data-onb="next" id="onbnext">${nextLabel}</button></div>`;
  let body = '';
  if (onbStep === 0) body = `
    <h2>👋 欢迎来到乐乐新闻</h2>
    <p class="lead">输入你的名字登入。以后用同一个名字，就能找回你的收藏和记录。</p>
    <div class="onb-body">
      <input class="field" id="onbname" value="${esc(profile.owner ? '' : profile.name)}" maxlength="20" placeholder="你的名字或称呼，例如：Mama、Jia Le" autocomplete="off">
      <div class="err" id="onberr" hidden></div>
      ${privacyHtml()}
    </div>${nav('登入', false)}`;
  if (onbStep === 1) body = `
    <h2>👀 怎么看比较舒服？</h2>
    <p class="lead">选了马上就能看到效果，之后可以在 ⚙️ 设置里改。</p>
    <div class="onb-body">
      <div class="size-pick">
        <button data-set="size" data-v="normal" class="${profile.size === 'normal' ? 'on' : ''}"><span class="a" style="font-size:1rem">标准</span><span class="note">一般字体</span></button>
        <button data-set="size" data-v="large" class="${profile.size === 'large' ? 'on' : ''}"><span class="a" style="font-size:1.35rem">大字</span><span class="note">适合长辈</span></button>
      </div>
      <div class="set-group" style="margin-top:1rem"><h4>颜色</h4><div class="seg">
        <button data-set="theme" data-v="light" class="${profile.theme === 'light' ? 'on' : ''}">☀️ 白色</button>
        <button data-set="theme" data-v="dark" class="${profile.theme === 'dark' ? 'on' : ''}">🌙 黑色</button>
        <button data-set="theme" data-v="auto" class="${profile.theme === 'auto' ? 'on' : ''}">📱 跟手机</button></div></div>
    </div>${nav()}`;
  if (onbStep === 2) body = `
    <h2>📰 你想看什么？</h2>
    <p class="lead">可以选多个。今日要闻只会显示这些类别。</p>
    <div class="onb-body"><div class="chips" style="flex-wrap:wrap;padding:0">
      ${Object.entries(CATS).map(([k, v]) => `<button class="chip ${profile.topics.includes(k) ? 'on' : ''}" data-action="topic" data-cat="${k}" style="font-size:1.05rem;padding:.6rem 1.1rem">${v}</button>`).join('')}
    </div><div class="err" id="toperr" hidden>请至少选一个</div></div>${nav()}`;
  if (onbStep === 3) body = `
    <h2>✨ 怎么用</h2>
    <div class="onb-body">
      <ul class="how">
        <li><b>📰</b><span><b style="width:auto">今日要闻</b>：每天 10 条重要新闻，看完就好</span></li>
        <li><b>📖</b><span>按「详细版」直接在 app 里看重点，不用等网站加载</span></li>
        <li><b>🎧</b><span>按下面「收听」，手机会读新闻给你听</span></li>
        <li><b>⭐</b><span>喜欢的新闻按「收藏」，以后在 ⭐ 收藏 里找</span></li>
        <li><b>💰</b><span>上面有今天的金价，按一下看更多</span></li>
        <li><b>🔍</b><span>右上角可以搜索新闻，例如「黄金」</span></li>
      </ul>
      ${isStandalone ? '' : `<div class="a2hs"><b>📲 放到手机桌面，像 app 一样打开</b><br>${isIOS
        ? '用 Safari 打开 → 按下面的 <b>分享</b> 按钮 (方框加箭头) → 选 <b>添加到主屏幕</b>'
        : '用 Chrome 打开 → 按右上角 <b>⋮</b> → 选 <b>添加到主屏幕</b> 或 <b>安装应用</b>'}</div>`}
    </div>${nav('开始看新闻 🎉')}`;
  el.innerHTML = `<div class="wrap">${dots}${body}</div>`;
  track('onboard_step', null, { step: onbStep + 1 });
  if (onbStep === 0) {
    const i = el.querySelector('#onbname');
    i.oninput = () => liveNameCheck(i, $('#onberr'));
    i.onkeydown = (e) => { if (e.key === 'Enter') $('#onbnext').click(); };
  }
}
$('#onboarding').addEventListener('click', (e) => {
  const s = e.target.closest('[data-set]');
  if (s) { profile[s.dataset.set] = s.dataset.v; saveProfile(); renderOnb(); return; }
  const t = e.target.closest('[data-action="topic"]');
  if (t) { toggleTopic(t.dataset.cat); renderOnb(); return; }
  const b = e.target.closest('[data-onb]'); if (!b) return;
  if (b.dataset.onb === 'back') { onbStep--; renderOnb(); return; }
  if (onbStep === 0) {
    const raw = $('#onbname').value;
    if (isOwnerKey(raw)) { // secret owner entry: skip the guide, no tracking
      enterOwner(); $('#onboarding').hidden = true; document.body.style.overflow = '';
      renderChips(); render(); toast('👋 Frank，欢迎回来（不记录）'); return;
    }
    const c = checkName(raw);
    if (c.err) { const e = $('#onberr'); e.textContent = c.err; e.hidden = false; $('#onbname').focus(); return; }
    const first = !profile.name; profile.name = c.name; profile.owner = false; saveProfile();
    track(first ? 'name_set' : 'rename', null, { name: c.name }); syncFavs();
  }
  if (onbStep === 2 && !profile.topics.length) { $('#toperr').hidden = false; return; }
  if (onbStep === 3) {
    profile.onboarded = true; saveProfile(); track('onboard_done');
    $('#onboarding').hidden = true; document.body.style.overflow = '';
    renderChips(); render(); return;
  }
  onbStep++; renderOnb();
});

function toggleTopic(k) {
  const t = profile.topics;
  profile.topics = t.includes(k) ? t.filter((x) => x !== k) : [...t, k];
  saveProfile(); track('topics', null, { topics: profile.topics.join(',') });
}

// ---------- listen mode (phone's built-in voice, free) ----------
const synth = window.speechSynthesis;
let queue = [], qi = 0, speaking = false;
function zhVoice() {
  const vs = synth.getVoices();
  return vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
}
function buildQueue() {
  const list = digestItems();
  const q = [{ text: `今日要闻，共 ${list.length} 条。` }];
  list.forEach((x, i) => {
    let t = `第 ${i + 1} 条，${CATS[x.cat] || ''}。${x.zh || x.title}。`;
    if (x.sum) t += x.sum;
    if (x.impact?.my) t += `对马来西亚：${x.impact.my}`;
    if (x.impact?.sea) t += `对东南亚：${x.impact.sea}`;
    if (x.impact?.world) t += `对全球：${x.impact.world}`;
    q.push({ id: x.id, text: t, title: x.zh || x.title });
  });
  if (gold?.spot) q.push({ text: `最后是金价。999黄金每克 ${gold.spot.g999.toFixed(0)} 令吉，916黄金每克 ${gold.spot.g916.toFixed(0)} 令吉${gold.spot.changePct != null ? `，比昨天${gold.spot.changePct >= 0 ? '上涨' : '下跌'}百分之${Math.abs(gold.spot.changePct)}` : ''}。` });
  q.push({ text: '今天的新闻就到这里，明天见。', end: true });
  return q;
}
function speakNext() {
  document.querySelectorAll('.card.speaking').forEach((c) => c.classList.remove('speaking'));
  if (qi >= queue.length) { stopSpeaking(); return; }
  const item = queue[qi];
  if (item.id) {
    const c = document.getElementById(`c-${item.id}`);
    if (c) { c.classList.add('speaking'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    $('#now').textContent = `正在播放：${item.title}`;
  }
  const u = new SpeechSynthesisUtterance(item.text);
  u.lang = 'zh-CN'; u.rate = profile.rate;
  const v = zhVoice(); if (v) u.voice = v;
  u.onend = () => {
    if (!speaking) return;
    if (item.id) { markRead(item.id); document.getElementById(`c-${item.id}`)?.classList.add('read'); }
    if (item.end) { track('listen_done'); finishToday(); }
    qi++; speakNext();
  };
  synth.speak(u);
}
function startSpeaking() {
  if (!synth) { toast('这个浏览器不支持朗读'); return; }
  if (tab !== 'digest') { tab = 'digest'; render(); }
  queue = buildQueue(); qi = 0; speaking = true;
  $('#play').textContent = '⏸ 停止'; $('#next').hidden = false;
  track('listen'); synth.cancel(); speakNext();
}
function stopSpeaking() {
  speaking = false; synth?.cancel();
  $('#play').textContent = '🎧 收听'; $('#next').hidden = true;
  $('#now').textContent = '把今日要闻读给你听';
  document.querySelectorAll('.card.speaking').forEach((c) => c.classList.remove('speaking'));
  render();
}
$('#play').onclick = () => (speaking ? stopSpeaking() : startSpeaking());
$('#next').onclick = () => { if (!speaking) return; synth.cancel(); setTimeout(() => { if (speaking && !synth.speaking) { qi++; speakNext(); } }, 150); };
$('#speed').onclick = (e) => {
  const rates = [1, 1.25, 1.5, 0.85]; profile.rate = rates[(rates.indexOf(profile.rate) + 1) % rates.length];
  saveProfile(); e.target.textContent = `${profile.rate}x`;
};
$('#speed').textContent = `${profile.rate}x`;
if (synth) synth.onvoiceschanged = () => {};

// ---------- tracking (Part B: Google Sheet via Apps Script) ----------
let tq = LS.get('tq', []);
function track(ev, id = null, extra = {}) {
  if (!CFG.trackUrl || profile.owner) return;
  const x = id ? story(id) : null;
  tq.push({ t: new Date().toISOString(), ev, id, title: x ? (x.zh || x.title) : undefined, ...extra });
  if (tq.length > 300) tq = tq.slice(-300);
  LS.set('tq', tq);
  clearTimeout(track.t); track.t = setTimeout(flush, 4000);
}
async function geo() {
  if (profile.owner) return {};
  const g = LS.get('geo', null);
  if (g && g.date === today()) return g;
  try {
    const r = await (await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: AbortSignal.timeout(5000) })).json();
    const v = { date: today(), city: r.city || '', region: r.region || '', country: r.country || '' };
    LS.set('geo', v); return v;
  } catch { return g || {}; }
}
function payload() {
  const g = LS.get('geo', {}) || {};
  return {
    device: profile.device, name: profile.name, city: g.city, region: g.region, country: g.country,
    os: isIOS ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : /Mac/i.test(navigator.userAgent) ? 'Mac' : /Win/i.test(navigator.userAgent) ? 'Windows' : 'Other',
    standalone: isStandalone, size: profile.size, theme: profile.theme,
    streak: streakNow(), readToday: readSet().size, version: CFG.version, events: tq,
  };
}
function flush(useBeacon = false) {
  if (!CFG.trackUrl || !tq.length || profile.owner) return;
  const body = JSON.stringify(payload());
  let ok = false;
  if (useBeacon && navigator.sendBeacon) ok = navigator.sendBeacon(CFG.trackUrl, new Blob([body], { type: 'text/plain' }));
  if (!ok) fetch(CFG.trackUrl, { method: 'POST', mode: 'no-cors', body, keepalive: body.length < 60000 }).catch(() => {});
  tq = []; LS.set('tq', tq);
}
async function syncFavs() {
  if (!CFG.trackUrl || !profile.name || profile.owner) return;
  try {
    const r = await (await fetch(`${CFG.trackUrl}?action=favs&name=${encodeURIComponent(profile.name)}`)).json();
    if (!Array.isArray(r.favs)) return;
    const f = favs(); let added = 0;
    for (const s of r.favs) if (s && s.id && !f[s.id]) { f[s.id] = s; added++; }
    if (added) { LS.set('favs', f); if (tab === 'favs') render(); }
  } catch {}
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action, id = b.dataset.id;
  const refresh = () => {
    const inReader = !$('#reader').hidden;
    if (inReader) { const x = story(id); $('#reader-actions').innerHTML = actionsHtml(x, { inReader: true }); }
    if (!$('#search').hidden) runSearch();
    render();
  };
  switch (a) {
    case 'topic': if (b.closest('#onboarding')) return; toggleTopic(b.dataset.cat); renderChips(); if (!$('#settings').hidden) b.classList.toggle('on'); stopIfSpeaking(); render(); break;
    case 'detail': case 'open': openReader(id); break;
    case 'read': markRead(id, !readSet().has(id)); render(); break;
    case 'star': toggleFav(id); refresh(); break;
    case 'like': setLike(id, 1); refresh(); break;
    case 'dislike': setLike(id, -1); refresh(); break;
    case 'link': openLink(id); break;
    case 'finish': finishToday(); break;
    case 'gold-toggle': goldOpen = !goldOpen; renderGold(); if (goldOpen) track('gold'); break;
    case 'open-search': openSearch(); break;
    case 'open-settings': openSettings(); break;
    case 'close-reader': history.back(); break;
    case 'close-search': history.back(); break;
    case 'close-settings': if (saveSettingsName()) history.back(); break;
    case 'privacy-more': { const f = b.parentElement.querySelector('.privacy-full'); f.hidden = !f.hidden; b.textContent = f.hidden ? '更多' : '收起'; break; }
    case 'replay-guide': closeOverlay('#settings'); openOnboarding(1); break;
  }
});
function stopIfSpeaking() { if (speaking) stopSpeaking(); }
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab; track('tab', null, { tab }); render();
  if (tab === 'favs') syncFavs();
});
// phone back button closes the top overlay
window.addEventListener('popstate', () => {
  for (const id of ['#reader', '#search', '#settings']) {
    if (!$(id).hidden) { if (id === '#settings') saveSettingsName(); closeOverlay(id); return; }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flush(true);
  else { load(); track('open', null, { resume: true }); }
});

// ---------- boot ----------
renderChips(); renderStreak(); load();
setInterval(load, 10 * 60 * 1000);
if (!profile.onboarded || !profile.name) openOnboarding(profile.name ? 1 : 0);
geo().then(() => { track('open'); flush(); });
syncFavs();
if (profile.size === 'large' && tab === 'live') tab = 'digest';
