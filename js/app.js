/* 乐乐新闻 Happy News: app logic (v2.0)
   Sections: helpers · icons · accounts · data · reading state (read/hist/streak/likes/存起来/稍后看) ·
   interests & 为你推荐 · digest · undo · home (lobby) · 要闻 · 即时 · 我的 · reader · gold page ·
   link confirm · search · settings · login & setup · listen · tracking · sync · events · boot */

'use strict';
const CFG = window.LELE_CONFIG || {};
const CATS = { finance: '财经', world: '国际', sea: '东南亚', malaysia: '马来西亚', china: '中国', tech: '科技' };
const CAT_COLOR = { finance: '#b45309', world: '#1d4ed8', sea: '#0f766e', malaysia: '#be123c', china: '#b91c1c', tech: '#6d28d9' };
const ALL_CATS = Object.keys(CATS);
const TOP_N = 6, REC_N = 4;
const HIST_MAX = 300;
const TZ = 'Asia/Kuala_Lumpur';

// ---------- helpers ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
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
const shortT = (x) => x.short || x.zh || x.title;
const fullT = (x) => x.zh || x.title;
const tagsOf = (x) => ((x.tags && x.tags.length) ? x.tags.slice(0, 2) : [CATS[x.cat]].filter(Boolean));

// ---------- icons (simple line icons) ----------
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .7 3.2 2.6 3.7 5.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0118 0v6"/><rect x="2.5" y="14" width="5" height="7" rx="2"/><rect x="16.5" y="14" width="5" height="7" rx="2"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5M8 7h7"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  up: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.3 7A2 2 0 0117.2 20H7"/>',
  down: '<path d="M7 13V4H4v9zM7 13l4 8a2 2 0 002-2v-4h5.5a2 2 0 002-2.3l-1.3-7A2 2 0 0017.2 4H7"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-3.5 3.5C11 7 10 4 10 2 6 5 5 9 5 15c0 4 3 7 7 7z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  coin: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  telescope: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- accounts: each phone remembers its names; each name has its own data ----------
// device-wide: 'device' {id}, 'users' {list:[{key,name,last}], current}, 'tq', 'geo', 'look', 'goldRange', 'wx'
// per name:    'u:<key>:profile|read|streak|days|likes|favs|later|hist|digest|interests|muted'
const OWNER = '__owner__';
const OWNER_KEY = ' '; // secret: a name of exactly one space
const isOwnerKey = (raw) => raw === OWNER_KEY;
const keyOf = (name) => String(name).trim().toLowerCase();
const newId = () => 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DEFAULT_PROFILE = { name: '', size: 'normal', theme: 'auto', topics: ['finance', 'world'], confirmLink: true, rate: 1, onboarded: false, owner: false };

(function migrateV11() { // v1.1 kept one global profile; move it under its name
  if (LS.get('users', null)) return;
  const old = LS.get('profile', null);
  const device = LS.get('device', null) || { id: (old && old.device) || newId() };
  LS.set('device', device);
  const users = { list: [], current: null };
  if (old && old.name) {
    const key = old.owner ? OWNER : keyOf(old.name);
    const { device: _d, ...prof } = old;
    LS.set(`u:${key}:profile`, prof);
    for (const k of ['read', 'streak', 'likes', 'favs', 'digest']) { const v = LS.get(k, null); if (v != null) LS.set(`u:${key}:${k}`, v); }
    if (!old.owner) users.list.push({ key, name: old.name, last: Date.now() });
    users.current = key;
  }
  for (const k of ['profile', 'read', 'streak', 'likes', 'favs', 'digest', 'topics', 'rate']) LS.del(k);
  LS.set('users', users);
})();

const DEVICE = LS.get('device', null) || (() => { const d = { id: newId() }; LS.set('device', d); return d; })();
let users = LS.get('users', { list: [], current: null });
let curKey = users.current;
const U = {
  get(k, d) { return curKey ? LS.get(`u:${curKey}:${k}`, d) : d; },
  set(k, v) { if (curKey) LS.set(`u:${curKey}:${k}`, v); },
};
let tab = 'home';
let mineTab = 'later';
const scrollPos = {};
let profile = curKey ? { ...DEFAULT_PROFILE, ...U.get('profile', {}) } : { ...DEFAULT_PROFILE };
const displayName = () => (profile.owner ? 'Frank' : profile.name);

function saveProfile() { U.set('profile', profile); applyLook(); }
// a setting the person chose: remember when, so the newest choice wins across phones
function touchSettings() { profile.settingsAt = Date.now(); saveProfile(); pushState(); }
function applyLook() {
  const sizeChanged = document.documentElement.dataset.size !== profile.size;
  document.documentElement.dataset.theme = profile.theme;
  document.documentElement.dataset.size = profile.size;
  LS.set('look', { theme: profile.theme, size: profile.size });
  if (profile.size === 'large' && tab === 'live') tab = 'home';
  if (sizeChanged && $('#tabbar').innerHTML) { renderTabbar(); render(); }
}
applyLook();

// returns true if this name is new on this phone
function login(key, name, owner = false) {
  flush(); // send the previous person's actions first
  curKey = key; users.current = key;
  if (!owner) users.list = [{ key, name, last: Date.now() }, ...users.list.filter((u) => u.key !== key)].slice(0, 8);
  LS.set('users', users);
  const existing = U.get('profile', null);
  profile = { ...DEFAULT_PROFILE, ...(existing || {}), name, owner };
  if (owner) profile.onboarded = true;
  saveProfile();
  tab = 'home';
  return !existing;
}
function logout() {
  track('logout'); flush(true);
  stopSpeaking();
  curKey = null; users.current = null; LS.set('users', users);
  profile = { ...DEFAULT_PROFILE }; applyLook();
  closeOverlay('#settings', false);
  openOnboarding(0);
}
function forgetName(key) {
  users.list = users.list.filter((u) => u.key !== key); LS.set('users', users);
}

function checkName(raw) {
  const n = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!n) return { err: '请输入名字才能登入' };
  if (n.length > 20) return { err: '名字最多 20 个字' };
  if (!/^[\p{Script=Han}A-Za-z0-9 ]+$/u.test(n)) return { err: '名字只能用中文、英文或数字' };
  if (!/[\p{Script=Han}A-Za-z]/u.test(n)) return { err: '名字要有文字，不能只有数字' };
  return { name: n };
}
// live hint while typing; a single space (owner key) shows nothing so the secret isn't revealed
function liveNameCheck(input, errEl) {
  const raw = input.value;
  if (!raw || isOwnerKey(raw)) { errEl.hidden = true; return; }
  const c = checkName(raw);
  errEl.textContent = c.err || ''; errEl.hidden = !c.err || c.err === '请输入名字才能登入';
}
const PRIVACY_SHORT = '🔒 用名字登入，就能保存你的阅读记录和喜好。我们也会记录大概城市，只用来改进 app。';
const PRIVACY_FULL = '你用名字登入后，我们会帮你记住阅读记录、存起来的新闻和喜好，换手机也能找回。我们会根据你看的新闻整理「我的兴趣」来推荐新闻。我们也会从网络地址记录大概城市（不用 GPS），用来显示天气和改进 app。资料不会给外人。';
const privacyHtml = () => `<div class="privacy">${PRIVACY_SHORT} <button class="more-btn" data-action="privacy-more">更多</button><div class="privacy-full" hidden>${PRIVACY_FULL}</div></div>`;

// ---------- data ----------
let data = { items: [] };
let gold = null;
let byId = new Map();
let loaded = false;
const story = (id) => byId.get(id) || (String(id).startsWith('ln:') ? lineStory(id.slice(3)) : null) || favs()[id] || later()[id] || histMap().get(id) || evStory(id) || null;
function evStory(id) { for (const ev of events.events || []) if (ev.stories?.[id]) return ev.stories[id]; return null; }

async function load() {
  try {
    const r = await fetch(`data/news.json?t=${Date.now()}`, { cache: 'no-store' });
    data = await r.json();
    byId = new Map(data.items.map((x) => [x.id, x]));
    loaded = true;
  } catch (e) {
    if (!loaded) toast('新闻加载失败，稍后再试');
  }
  try { gold = await (await fetch(`data/gold.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch {}
  try { events = await (await fetch(`data/events.json?t=${Date.now()}`, { cache: 'no-store' })).json(); indexEvents(); } catch {}
  try { photos = await (await fetch(`data/photos.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch {}
  if (!speaking || tab !== 'news') render();
}
const updatedText = () => data.updated ? '更新于 ' + new Date(data.updated).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '加载中…';

// ---------- reading state ----------
function slim(x) {
  const { id, title, zh, short, key, url, source, cat, published, sum, impact, detail, tags } = x;
  return { id, title, zh, short, key, url, source, cat, published, sum, impact, detail, tags };
}
function readSet() { return new Set(U.get('read', {})[today()] || []); }
const hist = () => U.get('hist', []);
const histMap = () => new Map(hist().map((h) => [h.id, h]));
function addHist(id, how) {
  const x = story(id); if (!x || !curKey) return;
  const at = new Date().toISOString();
  const h = [{ ...slim(x), at, how }, ...hist().filter((y) => y.id !== id)].slice(0, HIST_MAX);
  U.set('hist', h);
  track('hist', id, { story: slim(x), at, how });
}
function markRead(id, on = true, how = 'read') {
  const s = readSet(); const had = s.has(id);
  on ? s.add(id) : s.delete(id);
  U.set('read', { [today()]: [...s] });
  if (on) {
    addHist(id, how);
    const l = later(); if (l[id]) { delete l[id]; U.set('later', l); } // 稍后看: gone once read
    if (!had) { track('read', id); signal(id, how === 'listen' ? 2 : 1); }
  }
}
function streakNow() {
  const s = U.get('streak', { last: null, n: 0 });
  return s.last === today() || s.last === yesterday() ? s.n : 0;
}
const doneToday = () => U.get('streak', {}).last === today();
function finishToday() {
  const s = U.get('streak', { last: null, n: 0 });
  if (s.last === today()) return;
  // stories in today's list that were left unread count as a small "skip"
  const d = digest(); const read = readSet();
  for (const x of d.all) if (!read.has(x.id)) signal(x.id, -0.5, true);
  U.set('streak', { last: today(), n: s.last === yesterday() ? s.n + 1 : 1 });
  U.set('days', [...new Set([today(), ...U.get('days', [])])].slice(0, 14));
  track('finish', null, { streak: streakNow() }); pushState();
  render();
  toast('✅ 今天看完了，明天见！');
}
function weekBar() {
  const days = new Set(U.get('days', []));
  const s = U.get('streak', {}); if (s.last) days.add(s.last);
  return `<div class="week" aria-hidden="true">${[6, 5, 4, 3, 2, 1, 0].map((i) => `<span class="${days.has(dateMY(Date.now() - i * 864e5)) ? 'on' : ''}"></span>`).join('')}</div>`;
}
const likes = () => U.get('likes', {});
function setLike(id, v) {
  const l = likes(); const was = l[id] || 0; l[id] = was === v ? 0 : v; if (!l[id]) delete l[id]; U.set('likes', l);
  track(l[id] === 1 ? 'like' : l[id] === -1 ? 'dislike' : 'unlike', id);
  if (l[id] === 1) signal(id, 4); if (l[id] === -1) signal(id, -6);
  pushState();
  return l[id] || 0;
}
const favs = () => U.get('favs', {});
const isFav = (id) => Boolean(favs()[id]);
function toggleFav(id) {
  const f = favs(); const x = story(id); if (!x) return false;
  if (f[id]) { delete f[id]; track('unstar', id); }
  else { f[id] = slim(x); f[id].savedAt = new Date().toISOString(); track('star', id, { story: f[id] }); signal(id, 5); }
  U.set('favs', f);
  return Boolean(f[id]);
}
const later = () => U.get('later', {});
const isLater = (id) => Boolean(later()[id]);
function toggleLater(id) {
  const l = later(); const x = story(id); if (!x) return false;
  if (l[id]) { delete l[id]; track('unlater', id); }
  else { l[id] = { ...slim(x), addedAt: new Date().toISOString() }; track('later', id); }
  U.set('later', l); pushState();
  return Boolean(l[id]);
}

// ---------- interests (为你推荐) ----------
// each tag: {w, t}; weight halves every 14 days. Category keys are 'c:<cat>' (hidden from the bubbles).
const HALF = 14 * 864e5;
const interests = () => U.get('interests', {});
const effW = (e) => (e ? e.w * Math.pow(0.5, (Date.now() - e.t) / HALF) : 0);
const muted = () => U.get('muted', {}); // tag -> {on, t}
const isMuted = (tag) => Boolean(muted()[tag]?.on);
function signal(id, delta, quiet = false) {
  const x = story(id); if (!x || !curKey) return;
  const it = interests(); const now = Date.now();
  for (const k of [...tagsOf(x), 'c:' + x.cat]) {
    const w = Math.max(-20, Math.min(60, effW(it[k]) + (k.startsWith('c:') ? delta * 0.5 : delta)));
    it[k] = { w: Math.round(w * 100) / 100, t: now };
  }
  U.set('interests', it);
  if (!quiet) pushState();
}
function topInterests(n = 8) {
  return Object.entries(interests()).filter(([k]) => !k.startsWith('c:') && !isMuted(k))
    .map(([k, e]) => [k, effW(e)]).filter(([, w]) => w >= 1).sort((a, b) => b[1] - a[1]).slice(0, n);
}
function setMute(tag, on) {
  const m = muted(); m[tag] = { on, t: Date.now() }; U.set('muted', m);
  track(on ? 'mute' : 'unmute', null, { tag }); pushState();
}
const coldStart = () => topInterests(3).reduce((s, [, w]) => s + w, 0) < 8;

function recommend(exclude) {
  const it = interests();
  const since = Date.now() - 48 * 3600e3;
  const seen = histMap(); const l = likes();
  const inEv = eventStoryIds();
  const pool = data.items.filter((x) => x.ai && Date.parse(x.published) >= since && !exclude.has(x.id) && !seen.has(x.id) && !inEv.has(x.id)
    && l[x.id] !== -1 && !tagsOf(x).some(isMuted));
  const cold = coldStart();
  const scored = pool.map((x) => {
    let best = null, bw = 0, s = 0;
    for (const t of tagsOf(x)) { const w = effW(it[t]); s += w; if (w > bw) { bw = w; best = t; } }
    s += 0.3 * effW(it['c:' + x.cat]) + ((x.score ?? 3) - 3) * (cold ? 3 : 0.8);
    return { x, s, best: bw >= 1 ? best : null };
  }).sort((a, b) => b.s - a.s);
  const out = [], perTag = {};
  for (const r of scored) {
    if (out.length >= REC_N - 1) break;
    const t = r.best || '_';
    if ((perTag[t] = (perTag[t] || 0) + 1) > 2) continue;
    out.push({ id: r.x.id, reason: !cold && r.best ? `因为你常看 ${r.best}` : '大家都在看' });
  }
  // 🔭 发现: an important story from the category this person reads least
  const catW = ALL_CATS.map((c) => [c, effW(it['c:' + c]) + (profile.topics.includes(c) ? 100 : 0)]).sort((a, b) => a[1] - b[1]);
  for (const [c] of catW) {
    const d = scored.filter((r) => r.x.cat === c && !out.some((o) => o.id === r.x.id)).sort((a, b) => (b.x.score ?? 3) - (a.x.score ?? 3))[0];
    if (d) { out.push({ id: d.x.id, reason: `发现：你比较少看 ${CATS[c]}`, discover: true }); break; }
  }
  for (const r of scored) { if (out.length >= REC_N) break; if (!out.some((o) => o.id === r.x.id)) out.push({ id: r.x.id, reason: '大家都在看' }); }
  return out;
}

// ---------- today's list: 6 important + 4 为你推荐 (locked for the day once AI-processed) ----------
function digest() {
  const key = `${today()}|${[...profile.topics].sort().join(',')}`;
  let saved = U.get('digest', null);
  let topIds;
  if (saved && saved.key === key && saved.ready && Array.isArray(saved.top) && saved.top.every((id) => byId.has(id))) topIds = saved.top;
  else {
    const since = Date.now() - 24 * 3600e3;
    const inEv = eventStoryIds();
    const pool = data.items.filter((x) => profile.topics.includes(x.cat) && Date.parse(x.published) >= since && !inEv.has(x.id));
    pool.sort((a, b) => (b.ai ? 1 : 0) - (a.ai ? 1 : 0) || (b.score ?? 3) - (a.score ?? 3) || (b.detail ? 1 : 0) - (a.detail ? 1 : 0) || b.published.localeCompare(a.published));
    const per = {}, pick = [];
    const cap = Math.max(2, Math.ceil(TOP_N / profile.topics.length));
    for (const x of pool) { if ((per[x.cat] = (per[x.cat] || 0) + 1) <= cap) pick.push(x); if (pick.length === TOP_N) break; }
    for (const x of pool) { if (pick.length >= TOP_N) break; if (!pick.includes(x)) pick.push(x); }
    topIds = pick.map((x) => x.id);
    const ready = pick.length >= 4 && pick.filter((x) => x.ai).length >= pick.length * 0.8;
    saved = { key, top: topIds, ready, rec: saved && saved.key === key ? saved.rec : null };
  }
  // recommendations: keep the ones already read today, refill the rest when needed
  const read = readSet(); const l = likes();
  let rec = (saved.rec || []).filter((r) => (byId.has(r.id) || read.has(r.id)) && l[r.id] !== -1 && (read.has(r.id) || !tagsOf(story(r.id) || {}).some(isMuted)));
  if (rec.length < REC_N && loaded) {
    const ex = new Set([...topIds, ...rec.map((r) => r.id)]);
    rec = [...rec, ...recommend(ex)].slice(0, REC_N);
  }
  saved.rec = rec;
  if (topIds.length) U.set('digest', saved);
  const top = topIds.map((id) => byId.get(id)).filter(Boolean);
  const recs = rec.map((r) => ({ ...r, x: story(r.id) })).filter((r) => r.x);
  return { top, rec: recs, all: [...top, ...recs.map((r) => r.x)] };
}

// ---------- undo bar (5 seconds) ----------
const SNAP_KEYS = ['read', 'hist', 'favs', 'later', 'likes', 'interests', 'muted', 'digest'];
function snapshot() { const s = {}; for (const k of SNAP_KEYS) s[k] = U.get(k, null); return s; }
function withUndo(msg, fn) {
  const snap = snapshot();
  const result = fn();
  const el = $('#undo');
  el.innerHTML = `<span>${esc(msg)}</span><button data-undo>${ic('undo')}撤销</button>`;
  el.hidden = false;
  clearTimeout(withUndo.t); withUndo.t = setTimeout(() => { el.hidden = true; }, 5000);
  el.querySelector('[data-undo]').onclick = () => {
    for (const k of SNAP_KEYS) { if (snap[k] == null) LS.del(`u:${curKey}:${k}`); else U.set(k, snap[k]); }
    el.hidden = true; track('undo', null, { what: msg }); pushState(); refreshAll(); toast('已撤销');
  };
  return result;
}

// ---------- tab bar + view switching ----------
function tabsList() {
  return profile.size === 'large'
    ? [['home', '首页', 'home'], ['news', '新闻', 'news'], ['mine', '我的', 'user']]
    : [['home', '首页', 'home'], ['news', '要闻', 'news'], ['live', '即时', 'bolt'], ['mine', '我的', 'user']];
}
function renderTabbar() {
  $('#tabbar').innerHTML = tabsList().map(([k, label, icon]) =>
    `<button class="t-${k} ${tab === k ? 'on' : ''}" data-tab="${k}" aria-current="${tab === k ? 'page' : 'false'}">${ic(icon)}<span>${label}</span></button>`).join('');
}
function go(t, opts = {}) {
  if (t === 'live' && profile.size === 'large') t = 'news';
  scrollPos[tab] = window.scrollY;
  tab = t;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== t; });
  renderTabbar(); render();
  window.scrollTo(0, opts.keep ? (scrollPos[t] || 0) : 0);
  track('tab', null, { tab: t });
  if (t === 'mine') pullState();
}
function render() {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== tab; });
  if (!curKey) return;
  if (tab === 'home') renderHome();
  else if (tab === 'news') renderNews();
  else if (tab === 'live') renderLive();
  else if (tab === 'mine') renderMine();
}
function refreshAll() {
  render();
  if (!$('#reader').hidden && readerId) renderReaderActions();
  if (!$('#search').hidden) runSearch();
}

// ---------- home (lobby) ----------
function greetWord() { const h = +new Date().toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }); return h < 12 ? '早安' : h < 18 ? '午安' : '晚上好'; }
function dateLine() {
  const d = new Date();
  const wd = d.toLocaleDateString('zh-CN', { timeZone: TZ, weekday: 'long' }).replace('星期', '星期');
  const md = d.toLocaleDateString('zh-CN', { timeZone: TZ, month: 'long', day: 'numeric' });
  return `${md} ${wd}`;
}
const DAYS_ZH = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
function lunar() {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { timeZone: TZ, month: 'long', day: 'numeric' }).formatToParts(new Date());
    const m = parts.find((p) => p.type === 'month')?.value || ''; const d = +(parts.find((p) => p.type === 'day')?.value || 0);
    if (!m || !d) return '';
    return `农历${m.replace('十一月', '冬月').replace('十二月', '腊月')}${DAYS_ZH[d] || ''}`;
  } catch { return ''; }
}
function wxText() {
  const w = LS.get('wx', null); if (!w || Date.now() - w.at > 3 * 3600e3) return '';
  const c = w.code;
  const [e, t] = c === 0 ? ['☀️', '晴'] : c <= 2 ? ['🌤', '多云'] : c === 3 ? ['☁️', '阴'] : c <= 48 ? ['🌫', '雾'] : c <= 67 ? ['🌧', '雨'] : c <= 77 ? ['🌨', '雪'] : c <= 82 ? ['🌦', '阵雨'] : ['⛈', '雷雨'];
  return `${e} ${Math.round(w.temp)}° ${t}`;
}
async function loadWeather() {
  const w = LS.get('wx', null); if (w && Date.now() - w.at < 30 * 60e3) return;
  const g = await geo(); if (!g.lat || !g.lon) return;
  try {
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(6000) })).json();
    if (r.current) { LS.set('wx', { at: Date.now(), temp: r.current.temperature_2m, code: r.current.weather_code, city: g.city }); if (tab === 'home') renderHome(); }
  } catch {}
}
function spark(points) {
  if (!points || points.length < 2) return '';
  const v = points.map((p) => p.g999); const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const d = v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * 100).toFixed(1)},${(28 - (y - min) / r * 26).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}
function goldChg() {
  const s = gold?.spot; if (!s || s.changePct == null) return '';
  return `<span class="${s.changePct >= 0 ? 'c-up' : 'c-down'}">${s.changePct >= 0 ? '▲' : '▼'} ${Math.abs(s.changePct)}%</span>`;
}
function renderHome() {
  const el = $('#v-home');
  if (!loaded) { el.innerHTML = `<div class="empty">加载中…</div>`; return; }
  const d = digest(); const read = readSet();
  const n = d.all.filter((x) => read.has(x.id)).length, total = d.all.length;
  const next = d.all.find((x) => !read.has(x.id));
  const done = doneToday() || (total && n === total);
  const mins = Math.max(1, Math.ceil((total - n) * 0.7));
  const s = gold?.spot;
  const recFirst = d.rec.find((r) => !read.has(r.x.id)) || d.rec[0];
  const liveList = liveItems(); const liveTop = liveList.find((x) => x.ai) || liveList[0];
  const sub = [dateLine(), lunar(), wxText()].filter(Boolean).join(' · ');
  const nLater = Object.keys(later()).length, nFav = Object.keys(favs()).length;

  if (profile.size === 'large') {
    el.innerHTML = `
      <div class="L-greet"><div><h1>${greetWord()}，${esc(displayName())}</h1><p>${esc(dateLine())}</p><p class="note" style="margin:0">${[lunar(), wxText()].filter(Boolean).join(' · ')}</p></div>
        <button class="round" data-action="open-settings" aria-label="设置" style="width:3rem;height:3rem">${ic('gear')}</button></div>
      <div class="L-card">
        <div class="L-left">${done ? '✅ 今天的新闻看完了' : `今天还有 ${total - n} 条新闻`}</div>
        <div class="L-bar"><div class="track"><i style="width:${total ? n / total * 100 : 0}%"></i></div><span>${n}/${total}</span></div>
        <button class="L-btn solid" data-action="listen-all">${ic('headphones')}听新闻</button>
        <button class="L-btn line" data-action="go-news">${ic('news')}看新闻</button>
      </div>
      ${s ? `<button class="L-row gold" data-action="open-gold"><span class="L-ic" style="background:#fde68a;color:#8a5300">${ic('coin')}</span>
        <span class="L-txt"><b>今天金价</b><span>999 每克</span></span><span class="L-end">${fmtRM(s.g999)}<br>${goldChg()}</span></button>` : ''}
      ${recFirst ? `<button class="L-row" data-action="open" data-id="${recFirst.x.id}"><span class="L-ic" style="background:var(--violet-soft);color:var(--violet)">${ic('spark')}</span>
        <span class="L-txt"><b>为你推荐</b><span>${esc(shortT(recFirst.x))}</span></span><span class="L-end">${ic('chev')}</span></button>` : ''}
      ${activeEvents()[0] ? (() => { const ev = activeEvents()[0]; return `<button class="L-row" data-action="open-event" data-ev="${ev.id}"><span class="L-ic" style="background:#fff1e8;color:var(--accent)">📌</span>
        <span class="L-txt"><b>大事件：${esc(ev.name)}</b><span>${flames(ev.heat?.score)} ${ev.heat?.sources || ''} 家媒体报道</span></span><span class="L-end">${ic('chev')}</span></button>`; })() : ''}
      <button class="L-row" data-action="go-mine" data-m="favs"><span class="L-ic" style="background:var(--accent-soft);color:var(--accent)">${ic('bookmark')}</span>
        <span class="L-txt"><b>存起来的新闻</b><span>${nLater ? `稍后看 ${nLater} 条 · ` : ''}存起来 ${nFav} 条</span></span><span class="L-end">${ic('chev')}</span></button>`;
    return;
  }

  el.innerHTML = `
    <div class="greet"><div class="g-text"><h1>${greetWord()}，${esc(displayName())}</h1><div class="g-sub">${sub}</div></div>
      <button class="round" data-action="open-search" aria-label="搜索">${ic('search')}</button>
      <button class="round" data-action="open-settings" aria-label="设置">${ic('gear')}</button></div>
    <section class="hero ${done ? 'done' : ''}">
      <div class="h-top"><span>${done ? '✅ 今日要闻 看完了' : '📰 今日要闻'}</span><small>已读 ${n}/${total}${done ? '' : ` · 剩约 ${mins} 分钟`}</small></div>
      <div class="track"><i style="width:${total ? n / total * 100 : 0}%"></i></div>
      ${next ? `<div class="h-kicker">下一条 · ${CATS[next.cat] || ''}</div><button class="h-title" data-action="open" data-id="${next.id}">${esc(shortT(next))}</button>`
        : `<div class="h-kicker">${done ? '明天再来看新的新闻 👋' : '全部读完了，按「看完了」记录今天'}</div>`}
      <div class="h-btns">
        <button class="b-solid" data-action="go-news">${ic('news')}${next ? '继续看' : '去看看'}</button>
        <button class="b-line" data-action="listen-all">${ic('headphones')}收听</button>
      </div>
    </section>
    <div class="grid2">
      ${s ? `<button class="tile gold" data-action="open-gold"><span class="t-label">${ic('coin')}金价 999</span>
        <span class="t-big">${fmtRM(s.g999)}<small>/克</small></span><span class="t-foot" style="margin-top:0">${goldChg()} 比昨天</span>
        ${spark(goldSeriesFor(31))}</button>` : `<div class="tile gold"><span class="t-label">${ic('coin')}金价</span><span class="t-foot">暂时没有资料</span></div>`}
      ${recFirst ? `<button class="tile" data-action="open" data-id="${recFirst.x.id}"><span class="t-label c-violet">${ic('spark')}为你推荐</span>
        <span class="t-head">${esc(shortT(recFirst.x))}</span><span class="t-foot">${esc(recFirst.reason)}</span></button>`
        : `<div class="tile"><span class="t-label c-violet">${ic('spark')}为你推荐</span><span class="t-foot">多看几则，推荐会更准</span></div>`}
      <button class="tile" data-action="go-live"><span class="t-label c-accent">${ic('bolt')}即时 · ${liveList.length} 条新的</span>
        <span class="t-head">${liveTop ? esc(shortT(liveTop)) : '过去 6 小时没有新的新闻'}</span><span class="t-foot">${liveTop ? esc(liveTop.source) + ' · ' + ago(liveTop.published) : ''}</span></button>
      <button class="tile" data-action="go-mine"><span class="t-label c-accent">${ic('flame')}连续阅读 ${streakNow()} 天</span>
        ${weekBar()}<span class="t-foot">稍后看 ${nLater} · 存起来 ${nFav} · 看过 ${hist().length}</span></button>
    </div>
    ${eventTiles()}`;
}

// ---------- 要闻 ----------
function chipsHtml(big = false) {
  const st = big ? ' style="font-size:1.05rem;padding:.6rem 1.1rem"' : '';
  const allOn = ALL_CATS.every((c) => profile.topics.includes(c));
  return `<button class="chip ${allOn ? 'on' : ''}" data-action="topic-all"${st}>全部</button>` +
    Object.entries(CATS).map(([k, v]) => `<button class="chip ${profile.topics.includes(k) ? 'on' : ''}" data-action="topic" data-cat="${k}"${st}>${v}</button>`).join('');
}
function actionsHtml(x, opts = {}) {
  const l = likes()[x.id] || 0; const fav = isFav(x.id); const lat = isLater(x.id); const read = readSet().has(x.id);
  return `<div class="actions">
    ${!opts.inReader ? `<button class="btn primary" data-action="open" data-id="${x.id}">${ic('book')}详细版</button>` : ''}
    <button class="btn ${fav ? 'on' : ''}" data-action="star" data-id="${x.id}">${ic('bookmark')}${fav ? '已存' : '存起来'}</button>
    ${!read || opts.inReader ? `<button class="btn icon ${lat ? 'on' : ''}" data-action="later" data-id="${x.id}" aria-label="${lat ? '取消稍后看' : '稍后看'}">${ic('clock')}</button>` : ''}
    <button class="btn icon ${l === 1 ? 'on' : ''}" data-action="like" data-id="${x.id}" aria-label="喜欢">${ic('up')}</button>
    <button class="btn icon ${l === -1 ? 'on' : ''}" data-action="dislike" data-id="${x.id}" aria-label="不喜欢">${ic('down')}</button>
  </div>`;
}
function card(x, label, read, reason) {
  return `<article class="card ${read ? 'read' : ''}" id="c-${x.id}" data-id="${x.id}">
    <div class="c-row"><div class="c-main">
    <div class="meta"><span class="tag">${label ? `${label} · ` : ''}${CATS[x.cat] || ''}</span><span>${esc(x.source)} · ${ago(x.published)}</span><span class="spacer"></span>
      <button class="readmark ${read ? 'on' : ''}" data-action="read" data-id="${x.id}" aria-label="${read ? '已读，按一下取消' : '标为已读'}">${ic('check')}${read ? '已读' : ''}</button></div>
    ${reason ? `<span class="reason ${reason.discover ? 'discover' : ''}">${reason.discover ? '🔭 ' : ''}${esc(reason.reason)}</span>` : ''}
    <h2 role="button" tabindex="0" data-action="open" data-id="${x.id}">${esc(shortT(x))}</h2>
    ${x.key ? `<p class="key">${esc(x.key)}</p>` : ''}
    </div>${thumbHtml(x)}</div>
    ${actionsHtml(x, { readBtn: true })}
  </article>`;
}
function renderNews() {
  const el = $('#v-news');
  const head = `<div class="vhead"><h1>${profile.size === 'large' ? '新闻' : '要闻'}</h1>
    <button class="round" data-action="open-search" aria-label="搜索">${ic('search')}</button></div>
    <div class="chips">${chipsHtml()}</div>`;
  if (!profile.topics.length) { el.innerHTML = head + `<div class="empty">在上面选至少一个类别</div>`; return; }
  if (!loaded) { el.innerHTML = head + `<div class="empty">加载中…</div>`; return; }
  const d = digest(); const read = readSet();
  const n = d.all.filter((x) => read.has(x.id)).length;
  if (!d.all.length) { el.innerHTML = head + `<div class="empty">过去24小时还没有这些类别的新闻</div>`; return; }
  const finished = doneToday();
  el.innerHTML = head + `
    <div class="progress"><span>已读 ${n}/${d.all.length}</span><div class="track"><i style="width:${n / d.all.length * 100}%"></i></div><span>${esc(updatedText())}</span></div>
    ${eventsSection()}
    <div class="part-h">今日最重要 · ${d.top.length} 条</div>
    ${d.top.map((x, i) => card(x, String(i + 1), read.has(x.id))).join('')}
    ${d.rec.length ? `<div class="rec-h"><b>${ic('spark')}为你推荐</b><span>根据你看过、存起来和 👍 的新闻挑选</span></div>
      ${coldStart() ? '<div class="hint">多用几天，推荐会更准 🙂</div>' : ''}
      ${d.rec.map((r) => card(r.x, '', read.has(r.x.id), r)).join('')}` : ''}
    <div class="done-box ${finished ? 'finished' : ''}">${finished ? '✅ 今天看完了，明天见！' : '<button class="big" data-action="finish">今天看完了 ✅</button>'}</div>`;
}

// ---------- 即时 ----------
function liveItems() {
  const since = Date.now() - 6 * 3600e3;
  return data.items.filter((x) => profile.topics.includes(x.cat) && Date.parse(x.published) >= since && !tagsOf(x).some(isMuted))
    .sort((a, b) => b.published.localeCompare(a.published)).slice(0, 60);
}
function liveRow(x, q, when) {
  const text = q ? fullT(x) : shortT(x);
  const hl = (s) => q ? esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`) : esc(s);
  return `<button class="live" data-action="open" data-id="${x.id}">
    <div class="meta"><span class="tag">${CATS[x.cat] || ''}</span><span>${esc(x.source)} · ${when || ago(x.published)}</span>${x.detail ? '<span>📖</span>' : ''}${isFav(x.id) ? '<span>🔖</span>' : ''}</div>
    <div class="t">${hl(text)}</div>
  </button>`;
}
function renderLive() {
  const el = $('#v-live');
  const list = liveItems();
  el.innerHTML = `<div class="vhead"><h1>即时</h1><button class="round" data-action="open-search" aria-label="搜索">${ic('search')}</button></div>
    <div class="chips">${chipsHtml()}</div>
    <div class="count">过去 6 小时 · ${list.length} 条 · ${esc(updatedText())}</div>
    ${list.length ? list.map((x) => liveRow(x)).join('') : `<div class="empty">过去6小时没有新的新闻</div>`}`;
}

// ---------- 我的 ----------
function iconSquare(x) {
  const c = CAT_COLOR[x.cat] || '#5c6069';
  return `<span style="width:2.6rem;height:2.6rem;border-radius:.8rem;background:${c}1a;color:${c};display:flex;align-items:center;justify-content:center;flex:none;font-weight:900;font-size:.8rem">${esc((CATS[x.cat] || '新').slice(0, 2))}</span>`;
}
function mrow(x, sub) {
  return `<button class="mrow" data-action="open" data-id="${x.id}">${iconSquare(x)}
    <span class="m-txt"><b>${esc(shortT(x))}</b><span>${esc(sub)}</span></span><span class="chev">${ic('chev')}</span></button>`;
}
function renderMine() {
  const el = $('#v-mine');
  const L = Object.values(later()).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  const F = Object.values(favs()).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  const H = hist();
  const tabs = [['later', '稍后看', L.length, 'clock'], ['favs', '存起来', F.length, 'bookmark'], ['hist', '看过', H.length, 'eye']];
  let list = '';
  if (mineTab === 'later') {
    list = L.length ? `<div class="note-line">${ic('check')}看完会自动移走</div>` + L.map((x) => mrow(x, `${CATS[x.cat] || ''} · ${x.source} · ${ago(x.addedAt || x.published)}加入`)).join('')
      : `<div class="empty">${ic('clock')}还没有「稍后看」。<br>新闻卡上按 🕒，晚点有空再看。</div>`;
  } else if (mineTab === 'favs') {
    list = F.length ? F.map((x) => mrow(x, `${CATS[x.cat] || ''} · ${x.source}`)).join('')
      : `<div class="empty">${ic('bookmark')}还没有存起来的新闻。<br>看到重要的新闻，按「存起来」就会一直留在这里。</div>`;
  } else {
    if (!H.length) list = `<div class="empty">${ic('eye')}还没有看过的新闻。<br>打开「详细版」、按「已读」或收听，都会记在这里。</div>`;
    else {
      const groups = { 今天: [], 昨天: [], 更早: [] }; const t0 = today(), t1 = yesterday();
      for (const h of H) { const d = dateMY(Date.parse(h.at)); groups[d === t0 ? '今天' : d === t1 ? '昨天' : '更早'].push(h); }
      const how = { detail: '看了详细版', listen: '听过', read: '已读', open: '看过' };
      const when = (h) => {
        const dt = new Date(h.at); const hm = dt.toLocaleTimeString('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
        const day = dateMY(dt.getTime());
        return `${day === t0 || day === t1 ? hm : `${+day.slice(5, 7)}/${+day.slice(8, 10)} ${hm}`} ${how[h.how] || '看过'}`;
      };
      list = Object.entries(groups).filter(([, v]) => v.length).map(([g, v]) => `<div class="group-h">${g}（${v.length}）</div>${v.slice(0, 100).map((h) => mrow(h, when(h))).join('')}`).join('');
    }
  }
  const top = topInterests(8); const maxW = top[0]?.[1] || 1;
  const mutedList = Object.entries(muted()).filter(([, v]) => v.on).map(([k]) => k);
  el.innerHTML = `
    <div class="me-head"><div class="avatar">${esc(displayName().slice(0, 1).toUpperCase())}</div>
      <div class="me-name">${esc(displayName())}${profile.owner ? ' 👑' : ''}</div>
      <button class="round" data-action="logout" aria-label="换人">${ic('users')}</button>
      <button class="round" data-action="open-settings" aria-label="设置">${ic('gear')}</button></div>
    ${profile.owner ? `<button class="mrow" data-action="open-admin" style="background:var(--ink);color:var(--bg);border:0"><span style="font-size:1.6rem">👑</span><span class="m-txt"><b>管理 · 谁在用</b><span style="color:inherit;opacity:.75">在线、今天、所有人、最新动作</span></span><span class="chev">${ic('chev')}</span></button>` : ''}
    <div class="stats">
      <div class="stat"><span class="c-accent">${ic('flame')}</span><b>${streakNow()}</b><span>连续天数</span></div>
      <div class="stat"><span class="c-up">${ic('eye')}</span><b>${H.length}</b><span>看过</span></div>
      <div class="stat"><span class="c-violet">${ic('bookmark')}</span><b>${F.length}</b><span>存起来</span></div>
    </div>
    <div class="seg3">${tabs.map(([k, label, n]) => `<button data-action="mine-tab" data-m="${k}" class="${mineTab === k ? 'on' : ''}">${label} ${n}</button>`).join('')}</div>
    ${list}
    <div class="interests"><h3>${ic('heart')}我的兴趣</h3>
      ${top.length ? `<div class="bubbles">${top.map(([k, w]) => `<span class="bubble l${w / maxW > 0.66 ? 3 : w / maxW > 0.33 ? 2 : 1}">${esc(k)}<button data-action="mute" data-tag="${esc(k)}" aria-label="少推荐 ${esc(k)}">${ic('x')}</button></span>`).join('')}</div>`
        : '<div class="note">多看几则新闻，这里会出现你常看的主题。</div>'}
      ${mutedList.length ? `<p>已少推荐：${mutedList.map((k) => `<button class="more-btn" data-action="unmute" data-tag="${esc(k)}">${esc(k)} ↺</button>`).join(' ')}</p>` : ''}
      <p>越大 = 你越常看。按 × 就少推荐这类新闻。</p></div>`;
}

// ---------- reader (详细版) ----------
let readerId = null;
function impactHtml(x) {
  if (!x.impact || !(x.impact.my || x.impact.sea || x.impact.world)) return '';
  return `<div class="impact">
    ${x.impact.my ? `<div><b>🇲🇾</b><span>${esc(x.impact.my)}</span></div>` : ''}
    ${x.impact.sea ? `<div><b>🌏</b><span>${esc(x.impact.sea)}</span></div>` : ''}
    ${x.impact.world ? `<div><b>🌍</b><span>${esc(x.impact.world)}</span></div>` : ''}
  </div>`;
}
function openReader(id, push = true) {
  if (String(id).startsWith('ln:')) { if (lineById(id.slice(3))) openLine(id.slice(3), push); else toast('这条分线已经过期'); return; }
  const x = story(id); if (!x) return;
  readerId = id;
  markRead(id, true, x.detail ? 'detail' : 'open');
  track(x.detail ? 'detail' : 'open', id);
  if (x.detail) signal(id, 2); // +1 from read above = 3 for 详细版
  const el = $('#reader');
  el.innerHTML = `<div class="wrap reader">
    <div class="ov-head"><button class="close" data-action="close-reader">${ic('back')}返回</button><h3>${x.detail ? '详细版' : '新闻'}</h3>
      <button class="round" id="r-star" data-action="star" data-id="${x.id}" aria-label="存起来">${ic('bookmark')}</button></div>
    ${heroPic(x)}
    <div class="meta"><span class="tag">${CATS[x.cat] || ''}</span><span>${esc(x.source)} · ${ago(x.published)}</span></div>
    ${evStoryMap.get(x.id) ? `<button class="link-row" data-action="open-event" data-ev="${evStoryMap.get(x.id).ev.id}"><span>📌 属于大事件 <b>${esc(evStoryMap.get(x.id).ev.name)}</b>，看多家合并整理</span>${ic('chev')}</button>` : ''}
    <div class="r-title">${esc(fullT(x))}</div>
    ${x.zh && x.zh !== x.title ? `<div class="note" style="margin:-.2rem 0 .7rem">原标题：${esc(x.title)}</div>` : ''}
    ${x.sum ? `<p class="r-sum">${esc(x.sum)}</p>` : ''}
    ${x.detail || x.sum ? `<button class="listen-btn" data-action="listen-story" data-id="${x.id}" id="r-listen">${ic('headphones')}听这则</button>` : ''}
    ${x.detail ? `<div class="label">重点</div><ol>${x.detail.map((p, i) => `<li data-p="${i}"><span class="n">${i + 1}</span><span>${esc(p)}</span></li>`).join('')}</ol>`
      : !x.sum ? `<p class="note">这条新闻暂时没有摘要，可以去新闻网站看全文。</p>` : ''}
    ${x.impact ? `<div class="label">可能的影响</div>${impactHtml(x)}` : ''}
    <div id="reader-actions"></div>
    <button class="link-out" data-action="link" data-id="${x.id}">去新闻网站看全文 ↗</button>
    <p class="disclaimer">标题、重点和影响由 AI 根据原文整理，可能有误；以原文为准。</p>
  </div>`;
  renderReaderActions();
  el.hidden = false; el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  history.pushState({ ov: 'reader' }, '');
}
function renderReaderActions() {
  const x = story(readerId); if (!x) return;
  $('#reader-actions').innerHTML = actionsHtml(x, { inReader: true });
  $('#r-star')?.classList.toggle('on', isFav(x.id));
  const rs = $('#r-star'); if (rs) { rs.style.color = isFav(x.id) ? 'var(--accent)' : ''; rs.style.borderColor = isFav(x.id) ? 'var(--accent)' : ''; }
}
function closeOverlay(id, rerender = true) {
  const el = $(id); if (el.hidden) return;
  el.hidden = true;
  if (id === '#reader') { if (speakCtx === 'story') stopSpeaking(); readerId = null; }
  if (id === '#line') curLine = null;
  if (id === '#event') curEvent = null;
  if ([...document.querySelectorAll('.overlay')].every((o) => o.hidden)) document.body.style.overflow = '';
  if (rerender && id !== '#onboarding') render();
}

// ---------- gold page ----------
let goldRange = LS.get('goldRange', '1m');
const RANGES = { '1w': ['1周', 7], '1m': ['1个月', 31], '3m': ['3个月', 92], '1y': ['1年', 366] };
function goldSeriesFor(days) {
  const all = gold?.history?.length ? gold.history : gold?.trend || [];
  const from = dateMY(Date.now() - days * 864e5);
  return all.filter((p) => p.d >= from);
}
function chart(points) {
  if (!points || points.length < 2) return '<div class="note">暂时没有走势资料</div>';
  const v = points.map((p) => p.g999); const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const xy = v.map((y, i) => [(i / (v.length - 1) * 100), (36 - (y - min) / r * 32)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const fmtD = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  return `<div class="chart">
    <div class="chart-y"><span>${fmtRM(max)}</span><span>${fmtRM(min)}</span></div>
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="金价走势"><path class="area" d="${line} L100,40 L0,40 Z"/><path class="ln" d="${line}" vector-effect="non-scaling-stroke"/></svg>
    <div class="chart-x"><span>${fmtD(points[0].d)}</span><span>${fmtD(points[points.length - 1].d)}</span></div>
  </div>`;
}
function renderGoldPage() {
  const el = $('#goldpage');
  const s = gold?.spot, k = gold?.kijang;
  const asOf = s?.asOf ? new Date(s.asOf).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const pts = goldSeriesFor(RANGES[goldRange][1]);
  let stats = '';
  if (pts.length > 1) {
    const v = pts.map((p) => p.g999); const pct = ((v[v.length - 1] / v[0] - 1) * 100).toFixed(1);
    stats = `<div class="range-stats"><span class="chg ${pct >= 0 ? 'c-up' : 'c-down'}">${RANGES[goldRange][0]}：${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>
      <span>最高 ${fmtRM(Math.max(...v))}</span><span>最低 ${fmtRM(Math.min(...v))}</span></div>`;
  }
  el.innerHTML = `<div class="wrap">
    <div class="ov-head"><button class="close" data-action="close-gold">${ic('back')}返回</button><h3>💰 金价</h3></div>
    ${s ? `<div class="note">999 黄金 · 每克</div><div class="gp-price">${fmtRM(s.g999)}</div>
      <div class="gp-sub">${goldChg()}<span>916：${fmtRM(s.g916)}/克</span></div>` : ''}
    <div class="seg range">${Object.entries(RANGES).map(([k2, [label]]) => `<button data-action="gold-range" data-r="${k2}" class="${k2 === goldRange ? 'on' : ''}">${label}</button>`).join('')}</div>
    ${stats}${chart(pts)}
    <table class="gtable">
      ${s ? `<tr><td>999 每克</td><td>${fmtRM(s.g999)}</td></tr><tr><td>916 每克</td><td>${fmtRM(s.g916)}</td></tr><tr><td>每盎司 (31.1克)</td><td>${fmtRM(s.oz, 0)}</td></tr>` : ''}
      ${s?.changeG999 != null ? `<tr><td>比昨天（每克）</td><td class="${s.changeG999 >= 0 ? 'c-up' : 'c-down'}">${s.changeG999 >= 0 ? '+' : ''}${s.changeG999.toFixed(2)}</td></tr>` : ''}
      ${k ? `<tr><td>Kijang Emas 1oz 卖出</td><td>${fmtRM(k.oz.sell, 0)}</td></tr><tr><td>Kijang Emas 1oz 买入</td><td>${fmtRM(k.oz.buy, 0)}</td></tr>` : ''}
    </table>
    <div class="gnote">国际金价参考${asOf ? `（${asOf}）` : ''}${k ? `；Kijang Emas 为国家银行 ${esc(k.date)} 牌价` : ''}。${gold?.fxApprox ? '走势以今天汇率换算。' : ''}金铺价格会更高（另加工钱）。</div>
  </div>`;
}
function openGold() {
  if (!gold) { toast('金价还没加载好'); return; }
  renderGoldPage(); const el = $('#goldpage'); el.hidden = false; el.scrollTop = 0;
  document.body.style.overflow = 'hidden'; history.pushState({ ov: 'gold' }, ''); track('gold');
}

// ---------- link confirm + generic confirm + choice sheet ----------
function openLink(id) {
  const x = story(id); if (!x) return;
  openUrl(x.url, x.source, () => { track('link', id); signal(id, 3); });
}
function openUrl(url, source, onGo) {
  if (!url) return;
  const goOut = () => { onGo && onGo(); window.open(url, '_blank', 'noopener'); };
  if (!profile.confirmLink) { goOut(); return; }
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <p>即将打开《${esc(source)}》网站，可能需要几秒钟加载。要打开吗？</p>
    <label><input type="checkbox" id="noask"> 不再提醒</label>
    <div class="onb-nav"><button data-m="cancel">取消</button><button class="next" data-m="go">打开</button></div>
  </div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const a = e.target.closest('[data-m]')?.dataset.m;
    if (e.target === m || a === 'cancel') m.hidden = true;
    if (a === 'go') { if ($('#noask').checked) { profile.confirmLink = false; touchSettings(); } m.hidden = true; goOut(); }
  };
}
function confirmBox(html, okLabel, onOk) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p>${html}</p>
    <div class="onb-nav"><button data-m="cancel">取消</button><button class="next" data-m="ok">${okLabel}</button></div></div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const a = e.target.closest('[data-m]')?.dataset.m;
    if (e.target === m || a === 'cancel') m.hidden = true;
    if (a === 'ok') { m.hidden = true; onOk(); }
  };
}
function dislikeSheet(id) {
  const x = story(id); if (!x) return;
  const tags = tagsOf(x);
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p>👎 不喜欢这则，要怎样？</p>
    <div class="stack"><button data-m="one">只是这则</button>
    ${tags.map((t) => `<button data-m="mute" data-tag="${esc(t)}">少推荐「${esc(t)}」的新闻</button>`).join('')}
    <button data-m="cancel" style="border:0;background:none;color:var(--muted)">取消</button></div></div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const b = e.target.closest('[data-m]'); const a = b?.dataset.m;
    if (e.target === m || a === 'cancel') { m.hidden = true; return; }
    if (a === 'one') { m.hidden = true; withUndo('已标为不喜欢', () => setLike(id, -1)); refreshAll(); }
    if (a === 'mute') { m.hidden = true; const t = b.dataset.tag; withUndo(`以后少推荐「${t}」`, () => { setLike(id, -1); setMute(t, true); }); refreshAll(); }
  };
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
    <div class="ov-head"><button class="close" data-action="close-search">${ic('back')}返回</button><h3>搜索新闻</h3></div>
    <div class="search-box"><input id="sq" type="search" placeholder="例如：黄金、令吉、美联储" value="${esc(sState.q)}" enterkeyhint="search" autocomplete="off"></div>
    <div class="filters">
      <select id="ssort" aria-label="排序"><option value="new">最新</option><option value="top">最重要</option></select>
      <select id="sdate" aria-label="日期"><option value="all">全部日期</option><option value="today">今天</option><option value="yday">昨天</option><option value="older">更早</option></select>
      <select id="scat" aria-label="类别"><option value="all">全部类别</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}<option value="fav">🔖 存起来的</option><option value="later">🕒 稍后看</option><option value="hist">📜 我看过的</option></select>
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
  for (const f of [...Object.values(favs()), ...Object.values(later())]) if (!all.has(f.id)) all.set(f.id, f);
  const hm = histMap();
  for (const h of hm.values()) if (!all.has(h.id)) all.set(h.id, h);
  const ql = q.toLowerCase(); const terms = ql ? expand(ql) : [];
  const t0 = today(), t1 = yesterday();
  const list = [...all.values()].filter((x) => {
    if (cat === 'fav') { if (!isFav(x.id)) return false; }
    else if (cat === 'later') { if (!isLater(x.id)) return false; }
    else if (cat === 'hist') { if (!hm.has(x.id)) return false; }
    else if (cat !== 'all' && x.cat !== cat) return false;
    if (src !== 'all' && x.source !== src) return false;
    const d = dateMY(Date.parse(x.published));
    if (date === 'today' && d !== t0) return false;
    if (date === 'yday' && d !== t1) return false;
    if (date === 'older' && (d === t0 || d === t1)) return false;
    if (!ql) return true;
    const hay = [x.zh, x.short, x.key, x.title, x.sum, x.source, ...(x.tags || []), ...(x.detail || [])].filter(Boolean).join(' ').toLowerCase();
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
    <div class="ov-head"><button class="close" data-action="close-settings">${ic('back')}完成</button><h3>设置</h3></div>
    <div class="set-group"><div class="row"><div><h4 style="margin:0">目前登入</h4>
      <div class="who">👤 ${esc(displayName())}</div>
      ${profile.owner ? '<div class="note">👑 管理员模式：不会被记录</div>' : ''}</div>
      <button class="btn" data-action="logout">🚪 退出 / 换人</button></div>
      <p class="note">每个名字的存起来、稍后看、看过的新闻、🔥连续天数、兴趣和设置都分开保存。</p></div>
    <div class="set-group"><h4>字体大小</h4><div class="seg">
      <button data-set="size" data-v="normal" class="${profile.size === 'normal' ? 'on' : ''}">标准</button>
      <button data-set="size" data-v="large" class="${profile.size === 'large' ? 'on' : ''}">大字模式（长辈）</button></div>
      <p class="note">大字模式：字更大、按钮更大，首页更简单，隐藏「即时」。</p></div>
    <div class="set-group"><h4>颜色</h4><div class="seg">
      <button data-set="theme" data-v="light" class="${profile.theme === 'light' ? 'on' : ''}">☀️ 白色</button>
      <button data-set="theme" data-v="dark" class="${profile.theme === 'dark' ? 'on' : ''}">🌙 黑色</button>
      <button data-set="theme" data-v="auto" class="${profile.theme === 'auto' ? 'on' : ''}">📱 跟手机</button></div></div>
    <div class="set-group"><h4>今日要闻的类别</h4><div class="chips" id="setchips" style="flex-wrap:wrap;padding:0">${chipsHtml()}</div></div>
    <div class="set-group"><h4>收听速度</h4><div class="seg">
      ${[0.85, 1, 1.25, 1.5].map((r) => `<button data-set="rate" data-v="${r}" class="${profile.rate === r ? 'on' : ''}">${r}x</button>`).join('')}</div></div>
    <div class="set-group"><div class="row"><h4 style="margin:0">打开新闻网站前先提醒</h4>
      <div class="seg" style="flex:none"><button data-set="confirmLink" data-v="1" class="${profile.confirmLink ? 'on' : ''}">开</button><button data-set="confirmLink" data-v="0" class="${!profile.confirmLink ? 'on' : ''}">关</button></div></div></div>
    <div class="set-group"><button class="btn" data-action="replay-guide">↻ 重新看导览</button>
      ${privacyHtml()}
      <p class="note">乐乐新闻 v${esc(CFG.version || '')} · 新闻来自各大媒体，标题和摘要由 AI 整理</p></div>
  </div>`;
  el.hidden = false; document.body.style.overflow = 'hidden';
  history.pushState({ ov: 'settings' }, '');
  el.onclick = (e) => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const k = b.dataset.set; let v = b.dataset.v;
    if (k === 'rate') v = Number(v); if (k === 'confirmLink') v = v === '1';
    profile[k] = v; touchSettings(); track('settings', null, { [k]: v });
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
}

// ---------- login + first setup ----------
let onbStep = 0;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function openOnboarding(step = 0) {
  onbStep = step; $('#onboarding').hidden = false; document.body.style.overflow = 'hidden'; renderOnb();
}
function closeOnboarding() {
  $('#onboarding').hidden = true; document.body.style.overflow = '';
  tab = 'home'; renderTabbar(); render(); window.scrollTo(0, 0);
}
function renderOnb() {
  const el = $('#onboarding');
  const dots = `<div class="dots">${[1, 2, 3].map((i) => `<i class="${i === onbStep ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (nextLabel = '下一步') => `<div class="onb-nav">
    ${onbStep > 1 ? '<button data-onb="back">上一步</button>' : ''}
    <button class="next" data-onb="next" id="onbnext">${nextLabel}</button></div>`;
  let body = '';
  if (onbStep === 0) {
    const known = users.list;
    body = `
    <h2>👋 欢迎来到乐乐新闻</h2>
    <p class="lead">输入你的名字登入。以后用同一个名字，就能找回你的记录。</p>
    <div class="onb-body">
      ${known.length ? `<div class="known"><div class="note">这台手机用过（按一下就登入）：</div>
        <div class="chips" style="flex-wrap:wrap;padding:.3rem 0 0">${known.map((u) => `<span class="known-chip"><button class="chip on" data-login="${esc(u.key)}">👤 ${esc(u.name)}</button><button class="x" data-forget="${esc(u.key)}" aria-label="从这台手机移除">✕</button></span>`).join('')}</div>
        <div class="note" style="margin:.7rem 0 .3rem">或输入其他名字：</div></div>` : ''}
      <input class="field" id="onbname" value="" maxlength="20" placeholder="你的名字或称呼，例如：Mama、Jia Le" autocomplete="off">
      <div class="err" id="onberr" hidden></div>
      ${privacyHtml()}
    </div>${nav('登入')}`;
  }
  if (onbStep === 1) body = `
    <h2>👀 怎么看比较舒服？</h2>
    <p class="lead">选了马上就能看到效果，之后可以在设置里改。</p>
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
    <p class="lead">可以选多个，或按「全部」。「今日最重要」会从这些类别挑。</p>
    <div class="onb-body"><div class="chips" style="flex-wrap:wrap;padding:0">${chipsHtml(true)}</div>
      <div class="err" id="toperr" hidden>请至少选一个</div></div>${nav()}`;
  if (onbStep === 3) body = `
    <h2>✨ 怎么用</h2>
    <div class="onb-body">
      <ul class="how">
        <li><b>🏠</b><span><b>首页</b>：今天看了几条、金价、为你推荐，一眼看完</span></li>
        <li><b>📰</b><span><b>要闻</b>：每天 6 条最重要 + 4 条为你推荐，标题都很短</span></li>
        <li><b>📖</b><span>按「详细版」看完整标题、摘要和重点</span></li>
        <li><b>🎧</b><span>按「收听」，手机会读新闻给你听</span></li>
        <li><b>🔖</b><span>「存起来」一直留着；🕒「稍后看」看完会自动移走；按错了可以「撤销」</span></li>
        <li><b>🔍</b><span>右上角可以搜索新闻，例如「黄金」</span></li>
      </ul>
      ${isStandalone ? '' : `<div class="a2hs"><b>📲 放到手机桌面，像 app 一样打开</b><br>${isIOS
        ? '用 Safari 打开 → 按下面的 <b>分享</b> 按钮 (方框加箭头) → 选 <b>添加到主屏幕</b>'
        : '用 Chrome 打开 → 按右上角 <b>⋮</b> → 选 <b>添加到主屏幕</b> 或 <b>安装应用</b>'}</div>`}
    </div>${nav('开始看新闻 🎉')}`;
  el.innerHTML = `<div class="wrap">${onbStep > 0 ? dots : ''}${body}</div>`;
  track('onboard_step', null, { step: onbStep + 1 });
  if (onbStep === 0) {
    const i = el.querySelector('#onbname');
    i.oninput = () => liveNameCheck(i, $('#onberr'));
    i.onkeydown = (e) => { if (e.key === 'Enter') $('#onbnext').click(); };
  }
}
async function afterLogin(isNew, how) {
  track(isNew ? 'name_set' : how, null, { name: profile.name });
  let restored = false;
  if (isNew && CFG.trackUrl) { // new on this phone: bring this name's data from other phones first
    const btn = $('#onbnext'); if (btn) { btn.disabled = true; btn.textContent = '同步中…'; }
    restored = await Promise.race([pullState(), new Promise((r) => setTimeout(() => r(false), 6000))]);
  } else pullState();
  if (profile.onboarded) { closeOnboarding(); toast(restored ? `👋 ${profile.name}，已找回你的记录` : `👋 ${profile.name}，欢迎回来`); }
  else { onbStep = 1; renderOnb(); }
}
$('#onboarding').addEventListener('click', (e) => {
  const lg = e.target.closest('[data-login]');
  if (lg) { const u = users.list.find((x) => x.key === lg.dataset.login); if (u) afterLogin(login(u.key, u.name), 'switch_user'); return; }
  const fg = e.target.closest('[data-forget]');
  if (fg) {
    const u = users.list.find((x) => x.key === fg.dataset.forget);
    if (u) confirmBox(`从这台手机的名单移除「${esc(u.name)}」？<br><span class="note">资料不会删除，再输入这个名字就能找回。</span>`, '移除', () => { forgetName(u.key); renderOnb(); });
    return;
  }
  const s = e.target.closest('[data-set]');
  if (s) { profile[s.dataset.set] = s.dataset.v; touchSettings(); renderOnb(); return; }
  if (e.target.closest('[data-action="topic-all"]')) { setAllTopics(); renderOnb(); return; }
  const t = e.target.closest('[data-action="topic"]');
  if (t) { toggleTopic(t.dataset.cat); renderOnb(); return; }
  const b = e.target.closest('[data-onb]'); if (!b) return;
  if (b.dataset.onb === 'back') { onbStep--; renderOnb(); return; }
  if (onbStep === 0) {
    const raw = $('#onbname').value;
    if (isOwnerKey(raw)) { // secret owner entry: skip the guide, never tracked
      tq = []; LS.set('tq', tq);
      login(OWNER, 'Frank', true); closeOnboarding(); toast('👋 Frank，欢迎回来（不记录）'); return;
    }
    const c = checkName(raw);
    if (c.err) { const er = $('#onberr'); er.textContent = c.err; er.hidden = false; $('#onbname').focus(); return; }
    afterLogin(login(keyOf(c.name), c.name), 'login');
    return;
  }
  if (onbStep === 2 && !profile.topics.length) { $('#toperr').hidden = false; return; }
  if (onbStep === 3) {
    profile.onboarded = true; touchSettings(); track('onboard_done');
    closeOnboarding(); return;
  }
  onbStep++; renderOnb();
});

function toggleTopic(k) {
  const t = profile.topics;
  profile.topics = t.includes(k) ? t.filter((x) => x !== k) : [...t, k];
  touchSettings(); track('topics', null, { topics: profile.topics.join(',') });
}
function setAllTopics() {
  profile.topics = [...ALL_CATS]; touchSettings(); track('topics', null, { topics: 'all' });
}

// ---------- listen (phone's built-in voice, free) ----------
const synth = window.speechSynthesis;
let queue = [], qi = 0, speaking = false, paused = false, speakCtx = null;
// read English words the Chinese way
const SAY = [[/\bAI\b/gi, '人工智能'], [/\bUS\b/g, '美国'], [/\bUK\b/g, '英国'], [/\bEU\b/g, '欧盟'], [/\bFed\b/g, '美联储'], [/\bGDP\b/gi, '国内生产总值'],
  [/\bCEO\b/gi, '总裁'], [/\bIPO\b/gi, '首次公开招股'], [/\bEV\b/g, '电动车'], [/\bASEAN\b/gi, '东盟'], [/\bRM\s?(\d)/g, '$1令吉 '], [/\bKLCI\b/gi, '综合指数'], [/\bOPR\b/g, '隔夜政策利率']];
const sayable = (t) => SAY.reduce((s, [re, w]) => s.replace(re, w), String(t || ''));
function zhVoice() {
  const vs = synth.getVoices();
  return vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
}
function buildDigestQueue() {
  const d = digest(); const list = d.all;
  const q = [{ text: `今日要闻，共 ${list.length} 条。`, title: '今日要闻' }];
  list.forEach((x, i) => {
    let t = `第 ${i + 1} 条，${CATS[x.cat] || ''}。${fullT(x)}。`;
    if (x.sum) t += x.sum;
    if (x.impact?.my) t += `对马来西亚：${x.impact.my}`;
    q.push({ id: x.id, text: t, title: shortT(x) });
  });
  if (gold?.spot) q.push({ text: `最后是金价。999黄金每克 ${gold.spot.g999.toFixed(0)} 令吉${gold.spot.changePct != null ? `，比昨天${gold.spot.changePct >= 0 ? '上涨' : '下跌'}百分之${Math.abs(gold.spot.changePct)}` : ''}。` });
  q.push({ text: '今天的新闻就到这里，明天见。', end: true });
  return q;
}
function buildStoryQueue(x) {
  const q = [{ id: x.id, text: `${fullT(x)}。${x.sum || ''}`, title: shortT(x) }];
  (x.detail || []).forEach((p, i) => q.push({ id: x.id, p: i, text: `第 ${i + 1} 点。${p}`, title: shortT(x) }));
  if (x.impact?.my) q.push({ id: x.id, text: `对马来西亚的影响：${x.impact.my}`, title: shortT(x) });
  return q;
}
function setPlayerIcon() {
  $('#mp-play').innerHTML = paused ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4l13 8-13 8z"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
  $('#mp-play').setAttribute('aria-label', paused ? '继续' : '暂停');
}
function highlight(item) {
  document.querySelectorAll('.card.speaking, .reader li.speaking').forEach((c) => c.classList.remove('speaking'));
  highlightEvent(speakCtx === 'event' ? item : null);
  if (!item) return;
  if (speakCtx === 'digest' && item.id) {
    const c = document.getElementById(`c-${item.id}`);
    if (c) { c.classList.add('speaking'); if (tab === 'news' && $('#reader').hidden) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  if (speakCtx === 'story') {
    const li = item.p != null ? document.querySelector(`.reader li[data-p="${item.p}"]`) : null;
    if (li) { li.classList.add('speaking'); li.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    const rl = $('#r-listen'); if (rl) rl.innerHTML = `${ic('headphones')}${item.p != null ? `正在读第 ${item.p + 1} 点 · 按一下停止` : '正在读 · 按一下停止'}`;
  }
}
function speakNext() {
  if (qi >= queue.length) { stopSpeaking(); return; }
  if (qi < 0) qi = 0;
  const item = queue[qi];
  highlight(item);
  $('#mp-now').textContent = item.title ? `正在播放：${item.title}` : '乐乐新闻';
  const u = new SpeechSynthesisUtterance(sayable(item.text));
  u.lang = 'zh-CN'; u.rate = profile.rate;
  const v = zhVoice(); if (v) u.voice = v;
  const myQi = qi;
  u.onend = () => {
    if (!speaking || paused || myQi !== qi) return;
    if (item.id && speakCtx === 'digest') { markRead(item.id, true, 'listen'); document.getElementById(`c-${item.id}`)?.classList.add('read'); }
    if (item.end) { track('listen_done'); finishToday(); }
    qi++; speakNext();
  };
  synth.speak(u);
}
function startSpeaking(ctx, q) {
  if (!synth) { toast('这个浏览器不支持朗读'); return; }
  synth.cancel();
  queue = q; qi = 0; speaking = true; paused = false; speakCtx = ctx;
  $('#player').hidden = false; document.body.classList.add('playing'); setPlayerIcon();
  speakNext();
}
function stopSpeaking() {
  if (!speaking && $('#player').hidden) return;
  speaking = false; paused = false; synth?.cancel();
  $('#player').hidden = true; document.body.classList.remove('playing');
  highlight(null);
  const rl = $('#r-listen'); if (rl) rl.innerHTML = `${ic('headphones')}听这则`;
  const ll = $('#l-listen'); if (ll) ll.innerHTML = `${ic('headphones')}听这条分线`;
  speakCtx = null;
  render();
}
function jump(delta) {
  if (!speaking) return;
  synth.cancel();
  // jump between stories (digest) or between points (story)
  if (speakCtx === 'digest') {
    let i = qi + delta;
    while (i > 0 && i < queue.length && !queue[i].id && !queue[i].end) i += delta;
    qi = Math.max(0, Math.min(queue.length - 1, i));
  } else qi = Math.max(0, Math.min(queue.length - 1, qi + delta));
  paused = false; setPlayerIcon();
  setTimeout(() => { if (speaking && !paused) speakNext(); }, 120);
}
$('#mp-play').onclick = () => {
  if (!speaking) return;
  if (paused) { paused = false; setPlayerIcon(); speakNext(); }
  else { paused = true; synth.cancel(); setPlayerIcon(); }
};
// tap ⏭ = next part; hold ⏭ (大事件) = next storyline
let holdT = null, held = false;
$('#mp-next').onpointerdown = () => { held = false; holdT = setTimeout(() => { held = true; if (speakCtx === 'event' && speaking) { synth.cancel(); qi = jumpLine(1); paused = false; setPlayerIcon(); setTimeout(() => speaking && speakNext(), 120); toast('下一条线'); } }, 650); };
$('#mp-next').onpointerup = $('#mp-next').onpointerleave = () => clearTimeout(holdT);
$('#mp-next').onclick = () => { if (!held) jump(1); held = false; };
$('#mp-prev').onclick = () => jump(-1);
$('#mp-stop').onclick = () => stopSpeaking();
if (synth) synth.onvoiceschanged = () => {};

// ---------- tracking (Google Sheet via Apps Script) ----------
let tq = LS.get('tq', []);
function track(ev, id = null, extra = {}) {
  if (!CFG.trackUrl || profile.owner) return;
  const x = id ? story(id) : null;
  tq.push({ t: new Date().toISOString(), ev, id, title: x ? fullT(x) : undefined, who: profile.name || '', ...extra });
  if (tq.length > 300) tq = tq.slice(-300);
  LS.set('tq', tq);
  clearTimeout(track.t); track.t = setTimeout(flush, 4000);
}
async function geo() {
  const g = LS.get('geo', null);
  if (g && g.date === today() && g.lat) return g;
  try {
    const r = await (await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: AbortSignal.timeout(5000) })).json();
    const v = { date: today(), city: r.city || '', region: r.region || '', country: r.country || '', lat: r.latitude, lon: r.longitude };
    LS.set('geo', v); return v;
  } catch { return g || {}; }
}
const osName = () => isIOS ? (/iPad/i.test(navigator.userAgent) ? 'iPad' : 'iPhone') : /Android/i.test(navigator.userAgent) ? 'Android' : /Mac/i.test(navigator.userAgent) ? 'Mac' : /Win/i.test(navigator.userAgent) ? 'Windows' : 'Other';
function payload() {
  const g = LS.get('geo', {}) || {};
  return {
    device: DEVICE.id, name: profile.name, city: g.city, region: g.region, country: g.country,
    os: osName(), standalone: isStandalone, size: profile.size, theme: profile.theme,
    streak: streakNow(), readToday: readSet().size, version: CFG.version, events: tq,
  };
}
function flush(useBeacon = false) {
  if (!CFG.trackUrl || !tq.length) return;
  if (profile.owner) { tq = []; LS.set('tq', tq); return; }
  const body = JSON.stringify(payload());
  let ok = false;
  if (useBeacon && navigator.sendBeacon) ok = navigator.sendBeacon(CFG.trackUrl, new Blob([body], { type: 'text/plain' }));
  if (!ok) fetch(CFG.trackUrl, { method: 'POST', mode: 'no-cors', body, keepalive: body.length < 60000 }).catch(() => {});
  tq = []; LS.set('tq', tq);
}

// ---------- cross-phone sync (per name, via the Sheet) ----------
// Pull: 存起来, 看过, streak, settings, 👍/👎, 稍后看, interests, muted, done days; merged with this phone.
// Push: only after a successful pull, so a fresh phone never overwrites the saved data.
let syncedKey = null;
async function pullState() {
  if (!CFG.trackUrl || !profile.name || profile.owner || !curKey) return false;
  const key = curKey;
  try {
    const r = await (await fetch(`${CFG.trackUrl}?action=me&name=${encodeURIComponent(profile.name)}`)).json();
    if (key !== curKey) return false;
    let found = false;
    if (Array.isArray(r.favs)) {
      const f = favs();
      for (const s of r.favs) if (s && s.id && !f[s.id]) { f[s.id] = s; found = true; }
      U.set('favs', f);
    }
    if (Array.isArray(r.hist) && r.hist.length) {
      const m = new Map(hist().map((h) => [h.id, h]));
      for (const h of r.hist) if (h && h.id && (!m.has(h.id) || (h.at || '') > (m.get(h.id).at || ''))) { m.set(h.id, h); found = true; }
      U.set('hist', [...m.values()].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, HIST_MAX));
    }
    const st = r.state;
    if (st) {
      found = true;
      const a = U.get('streak', { last: null, n: 0 }), b = st.streak || { last: null, n: 0 };
      if ((b.last || '') > (a.last || '') || (b.last === a.last && (b.n || 0) > (a.n || 0))) U.set('streak', b);
      if (st.likes) U.set('likes', { ...st.likes, ...likes() });
      if (Array.isArray(st.follow)) U.set('follow', [...new Set([...follows(), ...st.follow])]);
      if (Array.isArray(st.days)) U.set('days', [...new Set([...U.get('days', []), ...st.days])].sort().reverse().slice(0, 14));
      if (st.interests) { // per tag: the newer entry wins
        const it = interests();
        for (const [k, e] of Object.entries(st.interests)) if (e && (!it[k] || e.t > it[k].t)) it[k] = e;
        U.set('interests', it);
      }
      if (st.muted) {
        const m = muted();
        for (const [k, e] of Object.entries(st.muted)) if (e && (!m[k] || e.t > m[k].t)) m[k] = e;
        U.set('muted', m);
      }
      if (st.later) { // union, minus anything already read on any phone
        const l = later(); const hm = histMap();
        for (const [id, s] of Object.entries(st.later)) {
          const h = hm.get(id);
          if (!l[id] && !(h && (h.at || '') > (s.addedAt || ''))) l[id] = s;
        }
        for (const [id, s] of Object.entries(l)) { const h = hm.get(id); if (h && (h.at || '') > (s.addedAt || '')) delete l[id]; }
        U.set('later', l);
      }
      const sv = st.settings || {};
      if (sv.name && keyOf(sv.name) === curKey && sv.name !== profile.name) {
        profile.name = sv.name; saveProfile();
        users.list = users.list.map((u) => (u.key === curKey ? { ...u, name: sv.name } : u)); LS.set('users', users);
      }
      if ((sv.settingsAt || 0) > (profile.settingsAt || 0) || (!profile.onboarded && sv.onboarded)) {
        for (const k of ['size', 'theme', 'topics', 'rate', 'confirmLink', 'settingsAt']) if (sv[k] !== undefined) profile[k] = sv[k];
        profile.onboarded = profile.onboarded || Boolean(sv.onboarded);
        saveProfile();
      }
    }
    syncedKey = key;
    pushState();
    if (!speaking) { renderTabbar(); render(); }
    return found;
  } catch { return false; }
}
function pushState() {
  if (!curKey || syncedKey !== curKey || profile.owner) return;
  clearTimeout(pushState.t);
  pushState.t = setTimeout(() => {
    const { name, size, theme, topics, rate, confirmLink, onboarded, settingsAt } = profile;
    // keep the synced copy small: drop near-zero interests, cap 稍后看
    const it = Object.fromEntries(Object.entries(interests()).filter(([, e]) => Math.abs(effW(e)) >= 0.5));
    const lat = Object.fromEntries(Object.entries(later()).slice(0, 40));
    track('sync', null, { state: {
      settings: { name, size, theme, topics, rate, confirmLink, onboarded, settingsAt },
      streak: U.get('streak', { last: null, n: 0 }), days: U.get('days', []), likes: likes(), follow: follows(),
      interests: it, muted: muted(), later: lat,
      top: topInterests(5).map(([k]) => k),
    } });
  }, 1500);
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  if (b.closest('#onboarding') && b.dataset.action !== 'privacy-more') return; // setup has its own handler
  if (adminAction(b.dataset.action, b)) return;
  const a = b.dataset.action, id = b.dataset.id;
  const topicsChanged = () => { const sc = $('#setchips'); if (sc) sc.innerHTML = chipsHtml(); if (speakCtx === 'digest') stopSpeaking(); render(); };
  switch (a) {
    case 'topic': toggleTopic(b.dataset.cat); topicsChanged(); break;
    case 'topic-all': setAllTopics(); topicsChanged(); break;
    case 'open': case 'detail': openReader(id); break;
    case 'read': {
      const on = !readSet().has(id);
      withUndo(on ? '已标为已读' : '已取消已读', () => markRead(id, on)); refreshAll(); break;
    }
    case 'star': { const was = isFav(id); withUndo(was ? '已从「存起来」移除' : '🔖 已存起来', () => toggleFav(id)); refreshAll(); break; }
    case 'later': { const was = isLater(id); withUndo(was ? '已从「稍后看」移除' : '🕒 已加入稍后看', () => toggleLater(id)); refreshAll(); break; }
    case 'like': { const v = withUndo('👍 谢谢，会多推荐类似的', () => setLike(id, 1)); if (!v) $('#undo').hidden = true; refreshAll(); break; }
    case 'dislike': if ((likes()[id] || 0) === -1) { setLike(id, -1); refreshAll(); } else dislikeSheet(id); break;
    case 'mute': { const t = b.dataset.tag; withUndo(`以后少推荐「${t}」`, () => setMute(t, true)); refreshAll(); break; }
    case 'unmute': setMute(b.dataset.tag, false); refreshAll(); toast('已恢复'); break;
    case 'link': openLink(id); break;
    case 'finish': finishToday(); break;
    case 'go-news': go('news'); { const d = digest(); const r = readSet(); const nx = d.all.find((x) => !r.has(x.id)); if (nx) setTimeout(() => document.getElementById(`c-${nx.id}`)?.scrollIntoView({ block: 'center' }), 50); } break;
    case 'go-live': go('live'); break;
    case 'go-mine': if (b.dataset.m) mineTab = b.dataset.m; go('mine'); break;
    case 'listen-all': track('listen'); startSpeaking('digest', buildDigestQueue()); break;
    case 'listen-story': {
      if (speakCtx === 'story' && speaking) { stopSpeaking(); break; }
      const x = story(id); if (x) { track('listen_story', id); signal(id, 1); startSpeaking('story', buildStoryQueue(x)); }
      break;
    }
    case 'open-gold': openGold(); break;
    case 'open-event': openEvent(b.dataset.ev); break;
    case 'open-line': if (!$('#line').hidden) { openLine(b.dataset.line, false); } else openLine(b.dataset.line); break;
    case 'open-story': openReader(id); break;
    case 'close-event': case 'close-line': case 'close-together': history.back(); break;
    case 'follow': {
      const f = follows(); const on = !f.includes(b.dataset.ev);
      U.set('follow', on ? [...f, b.dataset.ev] : f.filter((x) => x !== b.dataset.ev)); pushState();
      track(on ? 'follow' : 'unfollow', null, { event: evById(b.dataset.ev)?.name });
      b.classList.toggle('on', on); b.textContent = on ? '✓ 已追踪' : '＋ 追踪';
      toast(on ? '已追踪：有新进展会排在最前面' : '已取消追踪'); break;
    }
    case 'heat-info': heatInfo(b.dataset.ev); break;
    case 'listen-event': listenEvent(b.dataset.ev); break;
    case 'listen-line': listenLine(b.dataset.line); break;
    case 'listen-text': startSpeaking('text', [{ text: b.dataset.text, title: '一起读' }]); break;
    case 'together': openTogether(b.dataset.line, 0); break;
    case 'tg-prev': openTogether($('#together').dataset.line, togetherIdx - 1); break;
    case 'tg-next': openTogether($('#together').dataset.line, togetherIdx + 1); break;
    case 'toggle-per': { const el = b.closest('.src-list').querySelector('.per'); el.hidden = !el.hidden; b.textContent = el.hidden ? '展开全部原文重点 ▾' : '收起 ▴'; break; }
    case 'toggle-all-src': { const el = b.nextElementSibling; el.hidden = !el.hidden; break; }
    case 'link-raw': openUrl(b.dataset.url, b.dataset.src, () => track('link', null, { source: b.dataset.src })); break;
    case 'gold-range': goldRange = b.dataset.r; LS.set('goldRange', goldRange); renderGoldPage(); track('gold_range', null, { range: RANGES[goldRange][0] }); break;
    case 'mine-tab': mineTab = b.dataset.m; renderMine(); break;
    case 'open-search': openSearch(); break;
    case 'open-settings': openSettings(); break;
    case 'close-reader': case 'close-search': case 'close-settings': case 'close-gold': history.back(); break;
    case 'logout': confirmBox(`要退出「${esc(displayName())}」，换另一个人吗？<br><span class="note">你的资料会保存，下次按名字就能回来。</span>`, '换人', logout); break;
    case 'replay-guide': closeOverlay('#settings'); openOnboarding(1); break;
    case 'privacy-more': { const f = b.parentElement.querySelector('.privacy-full'); f.hidden = !f.hidden; b.textContent = f.hidden ? '更多' : '收起'; break; }
  }
});
$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  if (b.dataset.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  go(b.dataset.tab, { keep: true });
});
// phone back button closes the top overlay
window.addEventListener('popstate', () => {
  for (const id of ['#admin', '#together', '#reader', '#line', '#event', '#search', '#settings', '#goldpage']) if (!$(id).hidden) { if (id === '#admin') closeAdmin(); closeOverlay(id); return; }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flush(true);
  else { load(); if (curKey) track('open', null, { resume: true }); }
});

// ---------- boot ----------
renderTabbar(); render(); load();
setInterval(load, 10 * 60 * 1000);
// "still here" signal every 2 minutes while the app is open (for 👑 管理 → 在线); not shown in 动作记录
setInterval(() => { if (curKey && !profile.owner && !document.hidden) track('ping'); }, 120000);
if (!curKey) openOnboarding(0);
else if (!profile.onboarded) openOnboarding(1);
geo().then(() => { track('open'); flush(); loadWeather(); });
pullState();
