/* 乐乐新闻: listening with real recordings, so it keeps playing with the screen off.
   - recordings come from audio/index.json (made in the hourly update: Google voice, or free voice 7)
   - the chosen clips are joined into ONE file, so iPhone doesn't stop between stories when locked
   - lock screen / Bluetooth car buttons / earbuds control it (Media Session)
   - after your picks: keep playing unread news (or random, or stop)
   Loaded before app.js; uses app.js helpers at call time. */
'use strict';

let clipIdx = { clips: {} };
const SPECIAL = { intro: () => '乐乐新闻', brief: () => '今日重点', date: () => clipIdx.clips.date?.title || '今天', outro: () => '接下来：未读新闻', gold: () => '金价' };
const AU = new Audio();
AU.preload = 'auto';
let sess = null;           // { chapters:[{key,title,start,end,kind}], url, label, cont }
let auPlaying = false;
let pickMode = false, picked = [];
const hasClip = (k) => Boolean(clipIdx.clips?.[k]);
const clipOf = (k) => clipIdx.clips?.[k];
const SILENT = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

async function loadClips() {
  try { clipIdx = await (await fetch(`audio/index.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { clipIdx = { clips: {} }; }
}

// ---------- what to play ----------
function digestKeys() {
  const d = digest(); const keys = [];
  for (const ev of activeEvents().slice(0, 1)) keys.push(...eventKeys(ev));
  keys.push(...d.all.map((x) => x.id));
  return keys;
}
function eventKeys(ev) { return [`ev:${ev.id}`, ...ev.lines.filter(combined).map((l) => `ln:${l.id}`)]; }
// unread stories that have recordings: today's list first, then 为你推荐, then newest
function unreadKeys(exclude) {
  const read = readSet(); const out = [];
  const add = (k) => { if (hasClip(k) && !exclude.has(k) && !read.has(k) && !out.includes(k)) out.push(k); };
  digest().all.forEach((x) => add(x.id));
  for (const ev of activeEvents()) eventKeys(ev).forEach(add);
  Object.entries(clipIdx.clips || {}).filter(([k]) => byId.has(k) && !tagsOf(byId.get(k)).some(isMuted))
    .sort((a, b) => (byId.get(b[0]).published || '').localeCompare(byId.get(a[0]).published || '')).forEach(([k]) => add(k));
  if ((profile.afterList || 'unread') === 'random') out.sort(() => Math.random() - 0.5);
  return out;
}
function titleOf(k) {
  if (k.startsWith('ln:')) return lineById(k.slice(3))?.l.t || clipOf(k)?.title || '';
  if (k.startsWith('ev:')) return '大事件：' + (evById(k.slice(3))?.name || clipOf(k)?.title || '');
  const x = byId.get(k); return x ? shortT(x) : (clipOf(k)?.title || '');
}
const minsOf = (keys) => Math.max(1, Math.round(keys.reduce((s, k) => s + (clipOf(k)?.d || 40), 0) / 60));

// ---------- play: join the clips into one file ----------
async function playKeys(keys, { label = '我选的', cont = true, digestMode = false } = {}) {
  keys = [...new Set(keys)];
  const ok = keys.filter(hasClip);
  const missing = keys.length - ok.length;
  if (!ok.length) return false; // caller falls back to the phone voice
  // unlock audio inside the tap (iPhone needs this before anything async)
  try { AU.src = SILENT; AU.play().catch(() => {}); } catch {}
  stopSpeaking();
  const parts = [];
  // opening: today's date + main news (for today's list) or just the date (for your own picks)
  const opener = digestMode && hasClip('brief') ? 'brief' : hasClip('date') ? 'date' : hasClip('intro') ? 'intro' : null;
  if (opener) parts.push(opener);
  parts.push(...ok);
  if (digestMode && hasClip('gold')) parts.push('gold');
  let more = [];
  if (cont && (profile.afterList || 'unread') !== 'stop') {
    more = unreadKeys(new Set(parts)).slice(0, 15);
    if (more.length && hasClip('outro')) parts.push('outro');
    parts.push(...more);
  }
  toast(missing ? `${missing} 则还没有录音，先跳过` : '🎧 准备播放…');
  try {
    const bufs = await Promise.all(parts.map((k) => fetch(`audio/${clipOf(k).f}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })));
    let t = 0;
    const chapters = parts.map((k) => { const d = clipOf(k).d || 0; const c = { key: k, title: SPECIAL[k] ? SPECIAL[k]() : titleOf(k), start: t, end: t + d, extra: more.includes(k) }; t += d; return c; });
    if (sess?.url) URL.revokeObjectURL(sess.url);
    const url = URL.createObjectURL(new Blob(bufs, { type: 'audio/mpeg' }));
    sess = { chapters, url, label, cont, at: 0 };
    AU.src = url; AU.playbackRate = profile.rate || 1;
    await AU.play();
    auPlaying = true; showAuPlayer(); setMediaSession();
    track('listen_audio', null, { n: ok.length, label, more: more.length });
    return true;
  } catch (e) {
    toast('录音加载失败，改用手机声音');
    return false;
  }
}
function curChapter() {
  if (!sess) return -1;
  const t = AU.currentTime;
  return Math.max(0, sess.chapters.findIndex((c) => t >= c.start && t < c.end - 0.05));
}
function seekChapter(delta) {
  if (!sess) return;
  let i = curChapter();
  if (delta < 0 && AU.currentTime - sess.chapters[i].start > 3) delta = 0; // ⏮ = start of this story first
  i = Math.max(0, Math.min(sess.chapters.length - 1, i + delta));
  AU.currentTime = sess.chapters[i].start + 0.01;
  if (AU.paused) AU.play().catch(() => {});
  onAuTime(true);
}
function auToggle() { if (!sess) return; AU.paused ? AU.play().catch(() => {}) : AU.pause(); }
function auStop() {
  AU.pause(); auPlaying = false; sess = null;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  $('#player').hidden = true; document.body.classList.remove('playing');
  if (!$('#drive').hidden) renderDrive();
}
let lastCh = -1;
function onAuTime(force = false) {
  if (!sess) return;
  const i = curChapter(); const c = sess.chapters[i];
  if (i !== lastCh || force) {
    // the story before this one was heard: count it as read
    const prev = sess.chapters[lastCh];
    if (prev && i > lastCh && byId.has(prev.key)) { markRead(prev.key, true, 'listen'); document.getElementById(`c-${prev.key}`)?.classList.add('read'); }
    if (prev && i > lastCh && prev.key.startsWith('ln:')) addHist(prev.key, 'listen');
    lastCh = i;
    $('#mp-now').textContent = `${i + 1}/${sess.chapters.length} · ${c.title}`;
    setMediaSession();
    document.querySelectorAll('.card.speaking').forEach((e) => e.classList.remove('speaking'));
    document.getElementById(`c-${c.key}`)?.classList.add('speaking');
  }
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(AU.duration)) {
    try { navigator.mediaSession.setPositionState({ duration: c.end - c.start, position: Math.min(c.end - c.start, Math.max(0, AU.currentTime - c.start)), playbackRate: AU.playbackRate }); } catch {}
  }
  if (!$('#drive').hidden) renderDrive(false);
}
function setMediaSession() {
  if (!('mediaSession' in navigator) || !sess) return;
  const i = curChapter(); const c = sess.chapters[i];
  navigator.mediaSession.metadata = new MediaMetadata({ title: c.title, artist: `乐乐新闻 · ${i + 1}/${sess.chapters.length}`, album: sess.label, artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  set('play', () => AU.play()); set('pause', () => AU.pause());
  set('nexttrack', () => seekChapter(1)); set('previoustrack', () => seekChapter(-1));
  set('seekto', (d) => { const c = sess?.chapters[curChapter()]; if (c && d.seekTime != null) AU.currentTime = c.start + d.seekTime; });
  set('stop', () => auStop());
}
AU.addEventListener('timeupdate', () => onAuTime());
AU.addEventListener('play', () => { auPlaying = true; setAuIcon(); if (!$('#drive').hidden) renderDrive(); });
AU.addEventListener('pause', () => { setAuIcon(); if (!$('#drive').hidden) renderDrive(); });
AU.addEventListener('ended', async () => {
  if (!sess) return;
  const last = sess.chapters[sess.chapters.length - 1];
  if (byId.has(last.key)) markRead(last.key, true, 'listen');
  // more unread news? keep going (same player, so it continues with the screen off)
  if (sess.cont && (profile.afterList || 'unread') !== 'stop') {
    const more = unreadKeys(new Set(sess.chapters.map((c) => c.key))).slice(0, 15);
    if (more.length && await playKeys(more, { label: '未读新闻', cont: true })) return;
  }
  toast('✅ 播完了'); auStop(); render();
});
function setAuIcon() {
  if (!sess) return;
  $('#mp-play').innerHTML = AU.paused ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4l13 8-13 8z"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
}
function showAuPlayer() { $('#player').hidden = false; document.body.classList.add('playing'); setAuIcon(); onAuTime(true); }

// ---------- how are you listening? 🚗 / 🎧 / 🔊 ----------
// asked every time you start listening (Frank, 22 Nov); the last choice is highlighted
function chooseOut(then) {
  const last = profile.listenOut || '';
  const hi = (k) => (k === last ? 'border-color:var(--accent);background:var(--accent-soft);' : '');
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p style="font-weight:900">你在哪里听？</p>
    <div class="stack">
      <button data-m="car" style="height:auto;padding:.8rem 1rem;text-align:left;${hi('car')}"><b>🚗 开车</b><br><span class="note">大按钮的驾驶模式，蓝牙或 CarPlay 都可以</span></button>
      <button data-m="ear" style="height:auto;padding:.8rem 1rem;text-align:left;${hi('ear')}"><b>🎧 耳机</b><br><span class="note">走路、搭车时用，耳机按钮可以控制</span></button>
      <button data-m="speaker" style="height:auto;padding:.8rem 1rem;text-align:left;${hi('speaker')}"><b>🔊 手机外放</b></button>
      <button data-m="cancel" style="border:0;background:none;color:var(--muted)">取消</button>
    </div></div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const k = e.target.closest('[data-m]')?.dataset.m;
    if (e.target === m || k === 'cancel') { m.hidden = true; return; }
    if (k) { m.hidden = true; profile.listenOut = k; saveProfile(); then(k); }
  };
}
// main entry: play these keys (falls back to the phone voice when nothing is recorded)
async function listenKeys(keys, opts = {}, fallback) {
  const go = async (out) => {
    // 🚗 for today's news: open the start screen (▶ 播今天全部 / ☑ 自己选) instead of starting right away
    if (out === 'car' && opts.startScreen && !sess) { openDrive(); return; }
    if (out === 'car') openDrive(false);
    const ok = await playKeys(keys, opts);
    if (!ok && fallback) { if (out === 'car') closeDrive(); fallback(); }
  };
  if (!$('#drive').hidden) { await go('car'); return; } // already in 驾驶模式
  chooseOut(go);
}

// ---------- 选几则 (pick mode in 要闻) ----------
function togglePick(keys) {
  const has = keys.every((k) => picked.includes(k));
  picked = has ? picked.filter((k) => !keys.includes(k)) : [...picked, ...keys.filter((k) => !picked.includes(k))];
  renderNews(); renderPickBar();
}
function renderPickBar() {
  let bar = $('#pickbar');
  if (!pickMode || tab !== 'news') { if (bar) bar.remove(); document.body.classList.remove('picking'); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'pickbar'; bar.className = 'pickbar'; document.body.appendChild(bar); }
  document.body.classList.add('picking');
  const ok = picked.filter(hasClip).length;
  bar.innerHTML = `<div class="note" style="text-align:center;margin-bottom:.4rem">${picked.length ? `已选 ${picked.length} 则 · 约 ${minsOf(picked)} 分钟 · ${ok === picked.length ? '全部 🎧✓ 关屏也能听' : `${ok} 则关屏可听`}` : '按新闻卡片来选'}</div>
    <div class="pb-btns"><button class="btn" data-action="pick-drive" ${picked.length ? '' : 'disabled'}>🚗 驾驶模式</button><button class="btn primary" data-action="pick-play" ${picked.length ? '' : 'disabled'}>▶ 播放 ${picked.length || ''} 则</button></div>`;
}
function pickHead() {
  return `<div class="vhead"><button class="btn" data-action="pick-cancel">取消</button><h1 style="text-align:center;font-size:1.15rem">选要听的新闻</h1><button class="btn on" data-action="pick-all">全选</button></div>
    <div class="note" style="text-align:center;margin:-.4rem 0 .6rem">按一下就选上 · 会照顺序一则接一则播放</div>`;
}
const pickMark = (keys) => `<span class="pickmark ${keys.every((k) => picked.includes(k)) ? 'on' : ''}">${keys.every((k) => picked.includes(k)) ? '✓' : ''}</span>`;
const clipBadge = (k) => (hasClip(k) ? '<span class="bd g mini">🎧✓</span>' : '');

// ---------- 播放清单 ----------
let plTab = 'mine';
function openPlaylist() {
  const m = $('#modal');
  const lists = { mine: sess ? sess.chapters.filter((c) => !SPECIAL[c.key]).map((c) => c.key) : picked, today: digestKeys().filter(hasClip), later: Object.keys(later()).filter(hasClip) };
  const cur = sess ? sess.chapters[curChapter()]?.key : null;
  const list = lists[plTab];
  m.innerHTML = `<div class="modal sheet" role="dialog" aria-modal="true">
    <div class="row"><b style="font-size:1.2rem">🎧 播放清单</b><span class="note">${list.length} 则 · 约 ${minsOf(list)} 分钟</span></div>
    <div class="chips" style="margin:.6rem 0">${[['mine', sess ? '正在播' : '我选的'], ['today', '今日要闻'], ['later', '稍后看']].map(([k, l]) => `<button class="chip ${plTab === k ? 'on' : ''}" data-pl="${k}">${l} ${lists[k].length}</button>`).join('')}</div>
    <div class="pl-list">${list.length ? list.map((k, i) => `<div class="pl-row ${k === cur ? 'on' : ''}"><span class="pl-n">${k === cur ? '▶' : i + 1}</span>
      <span class="pl-t"><b>${esc(titleOf(k))}</b><span class="note">${hasClip(k) ? `约 ${Math.max(1, Math.round((clipOf(k).d || 40) / 60))} 分钟` : '📱 还没有录音'}</span></span>
      ${plTab === 'mine' && !sess ? `<button class="pl-b" data-pl-up="${i}" aria-label="往上">▲</button><button class="pl-b" data-pl-del="${i}" aria-label="移走">✕</button>` : ''}
      ${sess && plTab === 'mine' ? `<button class="pl-b" data-pl-go="${k}" aria-label="播这则">▶</button>` : ''}</div>`).join('') : '<div class="note" style="padding:1rem 0;text-align:center">这里还没有新闻</div>'}</div>
    <div class="set-group" style="margin:.8rem 0 0;padding:.6rem .9rem">
      <div class="row" style="padding:.2rem 0"><span>播完后</span><span class="seg" style="flex:none">${[['unread', '继续播未读'], ['random', '随机'], ['stop', '停止']].map(([k, l]) => `<button data-after="${k}" class="${(profile.afterList || 'unread') === k ? 'on' : ''}" style="min-width:0;padding:.35rem .5rem;font-size:.82rem">${l}</button>`).join('')}</span></div>
      <div class="row" style="padding:.2rem 0"><span>速度</span><span class="seg" style="flex:none">${[0.85, 1, 1.25].map((r) => `<button data-rate="${r}" class="${(profile.rate || 1) === r ? 'on' : ''}" style="min-width:0;padding:.35rem .6rem;font-size:.82rem">${r}x</button>`).join('')}</span></div>
    </div>
    <p class="note" style="text-align:center">关屏也会继续播放 · 车上 / 耳机的 ⏭ 换下一则</p>
    <div class="onb-nav" style="margin-top:.6rem"><button data-pl-act="drive">🚗 驾驶模式</button><button class="next" data-pl-act="${sess ? 'toggle' : 'play'}">${sess ? (AU.paused ? '▶ 继续' : '⏸ 暂停') : '▶ 播放'}</button></div></div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const t = e.target;
    if (t === m) { m.hidden = true; return; }
    const b = t.closest('button'); if (!b) return;
    if (b.dataset.pl) { plTab = b.dataset.pl; openPlaylist(); return; }
    if (b.dataset.plUp) { const i = +b.dataset.plUp; if (i > 0) [picked[i - 1], picked[i]] = [picked[i], picked[i - 1]]; openPlaylist(); return; }
    if (b.dataset.plDel) { picked.splice(+b.dataset.plDel, 1); openPlaylist(); return; }
    if (b.dataset.plGo) { const i = sess.chapters.findIndex((c) => c.key === b.dataset.plGo); if (i >= 0) { AU.currentTime = sess.chapters[i].start + 0.01; AU.play(); } m.hidden = true; return; }
    if (b.dataset.after) { profile.afterList = b.dataset.after; touchSettings(); openPlaylist(); return; }
    if (b.dataset.rate) { profile.rate = Number(b.dataset.rate); AU.playbackRate = profile.rate; touchSettings(); openPlaylist(); return; }
    const act = b.dataset.plAct;
    if (act === 'toggle') { auToggle(); m.hidden = true; }
    if (act === 'play' || act === 'drive') {
      m.hidden = true;
      if (act === 'drive') openDrive(false);
      if (!sess) playKeys(list, { label: plTab === 'today' ? '今日要闻' : plTab === 'later' ? '稍后看' : '我选的', digestMode: plTab === 'today' });
    }
  };
}

// ---------- 🚗 驾驶模式 ----------
let drivePushed = false;
function openDrive(push = true) {
  const el = $('#drive'); const was = !el.hidden; el.hidden = false; document.body.style.overflow = 'hidden';
  if (!was) { history.pushState({ ov: 'drive' }, ''); drivePushed = true; }
  void push;
  renderDrive(); track('drive_open');
}
function closeDrive(fromBack = false) {
  const el = $('#drive'); if (el.hidden) return;
  el.hidden = true;
  if ([...document.querySelectorAll('.overlay')].every((o) => o.hidden)) document.body.style.overflow = '';
  if (!fromBack && drivePushed) { drivePushed = false; history.back(); } else drivePushed = false;
}
let driveSig = '';
function renderDrive(full = true) {
  const el = $('#drive');
  if (drivePicking) { renderDrivePick(); driveSig = ''; return; }
  if (!sess) {
    const all = driveItems();
    el.innerHTML = `<div class="drive"><div class="dv-top"><b>🚗 驾驶模式</b><button class="dv-exit" data-action="close-drive">退出</button></div>
      <div class="dv-mid"><div class="dv-title" style="font-size:1.7rem">今天的新闻，一则接一则</div>
      <div class="dv-sub">共 ${all.length} 则有录音 · 约 ${minsOf(all.flatMap((i) => i.keys))} 分钟 · 关屏也会继续</div></div>
      <div class="dv-start">
        <button class="dv-big solid" data-action="drive-start">▶ 播今天全部</button>
        <button class="dv-big line" data-action="drive-pick">☑ 自己选</button>
      </div>
      <div class="dv-note">按一下就开始，之后不用再按。播完会继续播未读新闻。</div></div>`;
    driveSig = ''; return;
  }
  const i = curChapter(); const c = sess.chapters[i]; const nx = sess.chapters[i + 1];
  const sig = `${i}|${AU.paused}`;
  const pos = Math.max(0, AU.currentTime - c.start), len = Math.max(1, c.end - c.start);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  if (!full && sig === driveSig) { // only move the progress bar
    const bar = el.querySelector('.dv-bar i'); if (bar) bar.style.width = `${pos / len * 100}%`;
    const tm = el.querySelector('.dv-time span'); if (tm) tm.textContent = fmt(pos);
    return;
  }
  driveSig = sig;
  el.innerHTML = `<div class="drive"><div class="dv-top"><b>🚗 驾驶模式</b><span><button class="dv-exit" data-action="drive-pick" style="margin-right:.4rem">☑ 自己选</button><button class="dv-exit" data-action="close-drive">退出</button></span></div>
    <div class="dv-mid"><div class="dv-kicker">第 ${i + 1} / ${sess.chapters.length} 则${c.extra ? ' · 未读新闻' : ''}</div>
      <div class="dv-title">${esc(c.title)}</div>
      <div class="dv-bar"><i style="width:${pos / len * 100}%"></i></div><div class="dv-time"><span>${fmt(pos)}</span><span>${fmt(len)}</span></div></div>
    <div class="dv-ctrl"><button class="dv-side" data-action="au-prev" aria-label="上一则">⏮</button>
      <button class="dv-main" data-action="au-toggle" aria-label="${AU.paused ? '播放' : '暂停'}">${AU.paused ? '▶' : '⏸'}</button>
      <button class="dv-side" data-action="au-next" aria-label="下一则">⏭</button></div>
    ${nx ? `<div class="dv-next"><span>下一则</span><b>${esc(nx.title)}</b></div>` : ''}
    <div class="dv-note">屏幕可以关掉，会继续播放<br>方向盘 / 车上音响的 ⏭ 也能换下一则</div></div>`;
}

// ---------- 驾驶模式: choose your own (big list, with 10 / 20 / 30 分钟 quick picks) ----------
let drivePicking = false, drivePicked = new Set();
function driveItems() {
  const items = [];
  for (const ev of activeEvents().slice(0, 3)) { const keys = eventKeys(ev).filter(hasClip); if (keys.length) items.push({ id: 'ev:' + ev.id, keys, title: '大事件：' + ev.name, tag: '📌 大事件' }); }
  const seen = new Set(items.flatMap((i) => i.keys));
  const add = (x, tag) => { if (x && hasClip(x.id) && !seen.has(x.id)) { seen.add(x.id); items.push({ id: x.id, keys: [x.id], title: shortT(x), tag, read: readSet().has(x.id) }); } };
  const d = digest();
  d.top.forEach((x, i) => add(x, `${i + 1} · ${CATS[x.cat] || ''}`));
  d.rec.forEach((r) => add(r.x, '为你推荐'));
  Object.keys(clipIdx.clips || {}).map((k) => byId.get(k)).filter(Boolean)
    .sort((a, b) => (b.score ?? 3) - (a.score ?? 3) || b.published.localeCompare(a.published)).slice(0, 20)
    .forEach((x) => add(x, CATS[x.cat] || '新闻'));
  return items;
}
const itemMins = (it) => it.keys.reduce((s, k) => s + (clipOf(k)?.d || 40), 0) / 60;
function driveFit(mins) { // most important first, until the time is full
  drivePicked = new Set(); let t = (clipOf('date')?.d || 3) / 60;
  for (const it of driveItems()) { if (it.read) continue; const m = itemMins(it); if (t + m <= mins + 0.5) { drivePicked.add(it.id); t += m; } }
  renderDrivePick();
}
function renderDrivePick() {
  const items = driveItems();
  const sel = items.filter((i) => drivePicked.has(i.id));
  const tot = sel.reduce((s, i) => s + itemMins(i), 0);
  $('#drive').innerHTML = `<div class="drive dv-pick"><div class="dv-top"><b>☑ 自己选</b><button class="dv-exit" data-action="drive-pick-back">返回</button></div>
    <div class="dv-chips">${[10, 20, 30].map((m) => `<button data-action="drive-fit" data-m="${m}">${m} 分钟</button>`).join('')}<button data-action="drive-clear">清除</button></div>
    <div class="dv-list">${items.map((it) => `<button class="dv-row ${drivePicked.has(it.id) ? 'on' : ''}" data-action="drive-toggle" data-k="${esc(it.id)}">
      <span class="dv-check">${drivePicked.has(it.id) ? '✓' : ''}</span>
      <span class="dv-rt"><span class="dv-tag">${esc(it.tag)}${it.read ? ' · 看过' : ''}</span><b>${esc(it.title)}</b></span>
      <span class="dv-min">${Math.max(1, Math.round(itemMins(it)))} 分</span></button>`).join('')}</div>
    <div class="dv-bottom"><div>已选 ${sel.length} 则 · 约 ${Math.round(tot) || 0} 分钟</div>
      <button class="dv-big solid" data-action="drive-go" ${sel.length ? '' : 'disabled'}>▶ 开始</button></div></div>`;
}
function driveAction(a, b) {
  switch (a) {
    case 'drive-pick': drivePicking = true; renderDrive(); return true;
    case 'drive-pick-back': drivePicking = false; renderDrive(); return true;
    case 'drive-fit': driveFit(Number(b.dataset.m)); return true;
    case 'drive-clear': drivePicked = new Set(); renderDrivePick(); return true;
    case 'drive-toggle': { const k = b.dataset.k; drivePicked.has(k) ? drivePicked.delete(k) : drivePicked.add(k); const sc = $('.dv-list')?.scrollTop; renderDrivePick(); if ($('.dv-list')) $('.dv-list').scrollTop = sc; return true; }
    case 'drive-go': {
      const keys = driveItems().filter((i) => drivePicked.has(i.id)).flatMap((i) => i.keys);
      drivePicking = false; track('drive_pick', null, { n: drivePicked.size });
      if (sess) auStop();
      openDrive(); playKeys(keys, { label: '我选的' }); return true;
    }
  }
  return false;
}

// ---------- links that open straight into listening (for phone automations) ----------
function startFromHash() {
  const h = location.hash;
  if (!curKey || !['#drive', '#listen'].includes(h)) return;
  history.replaceState(null, '', location.pathname);
  if (h === '#drive') openDrive();
  else {
    const m = $('#modal');
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p style="font-weight:900;font-size:1.2rem">🎧 听今天的新闻</p>
      <p class="note">共 ${digestKeys().filter(hasClip).length} 则有录音，关屏也会继续</p>
      <div class="onb-nav"><button data-m="x">不用</button><button class="next" data-m="go" style="font-size:1.2rem">▶ 开始播放</button></div></div>`;
    m.hidden = false;
    m.onclick = (e) => { const k = e.target.closest('[data-m]')?.dataset.m; if (e.target === m || k === 'x') m.hidden = true; if (k === 'go') { m.hidden = true; playKeys(digestKeys(), { label: '今日要闻', digestMode: true }); } };
  }
}
const appLink = (h) => location.origin + location.pathname + h;
function autoGuideHtml() {
  return `<div class="set-group"><h4>🚗 上车自动打开（蓝牙）</h4>
    <p class="note" style="margin-top:0">网页不能自己知道你连了哪个蓝牙，但手机可以帮你：连上车子的蓝牙，就自动打开乐乐新闻。打开后按一次「▶」就开始。</p>
    <div class="link-box"><span>🚗 驾驶模式链接</span><code>${esc(appLink('#drive'))}</code><button class="btn" data-action="copy-link" data-link="${esc(appLink('#drive'))}">复制</button></div>
    <div class="link-box"><span>🎧 耳机模式链接</span><code>${esc(appLink('#listen'))}</code><button class="btn" data-action="copy-link" data-link="${esc(appLink('#listen'))}">复制</button></div>
    <details><summary><b>iPhone 设定方法</b></summary><ol class="steps-ol">
      <li>打开「快捷指令 Shortcuts」app → 下面「自动化 Automation」→ 右上 ＋</li>
      <li>选「蓝牙 Bluetooth」→ 选你车子的蓝牙 → 选「已连接 Is Connected」→ 选「立即运行 Run Immediately」</li>
      <li>「新建空白自动化」→ 加入动作「打开 URL」→ 贴上上面的 🚗 链接 → 完成</li>
      <li>耳机也一样：选你的耳机，贴上 🎧 链接</li></ol></details>
    <details><summary><b>Android（三星）设定方法</b></summary><ol class="steps-ol">
      <li>设定 → 「模式和例程 Modes and Routines」→ 例程 → ＋</li>
      <li>如果：「蓝牙设备 Bluetooth device」→ 选你车子的蓝牙 → 已连接</li>
      <li>那么：「打开网址」或「打开应用」→ 用 Chrome 打开上面的 🚗 链接 → 保存</li>
      <li>其他牌子：可以用「Tasker」或「MacroDroid」app，做法一样</li></ol></details></div>`;
}
window.addEventListener('hashchange', () => { if (loaded) startFromHash(); });
