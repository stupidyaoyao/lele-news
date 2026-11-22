/* 乐乐新闻: 👑 管理 (only in owner mode). Reads the Sheet through the tracker's PIN-protected admin request. */
'use strict';

let adminData = null, adminWho = null, adminTimer = null;
const adminPin = () => LS.get('adminPin', '');
function agoT(iso) { return iso ? ago(iso) : '—'; }
function hm(iso) { return iso ? new Date(iso).toLocaleTimeString('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : ''; }

function openAdmin(push = true) {
  const el = $('#admin');
  el.hidden = false; el.scrollTop = 0; document.body.style.overflow = 'hidden';
  if (push) history.pushState({ ov: 'admin' }, '');
  adminWho = null;
  if (!adminPin()) renderPinForm(); else loadAdmin();
  clearInterval(adminTimer);
  adminTimer = setInterval(() => { if (!$('#admin').hidden && adminPin() && !document.hidden) loadAdmin(true); }, 60000);
}
function closeAdmin() { clearInterval(adminTimer); }
function adminHead(title, back = false) {
  return `<div class="ov-head"><button class="close" data-action="${back ? 'admin-back' : 'close-admin'}">${ic('back')}${back ? '所有人' : '返回'}</button><h3>${title}</h3>
    <button class="round" data-action="admin-refresh" aria-label="刷新">↻</button></div>`;
}
function renderPinForm(msg = '') {
  $('#admin').innerHTML = `<div class="wrap">${adminHead('👑 管理')}
    <div class="set-group" style="text-align:center">
      <h4 style="font-size:1.1rem">输入 6 位管理密码</h4>
      <input class="field" id="adminpin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" style="text-align:center;font-size:1.6rem;letter-spacing:.5rem" placeholder="••••••">
      <div class="err" id="adminerr" ${msg ? '' : 'hidden'}>${msg}</div>
      <button class="btn primary" style="margin-top:1rem;width:100%;justify-content:center;height:3rem" data-action="admin-pin">进入</button>
      <p class="note">这台手机会记住密码。密码只存在你的 Google 表格设定里。</p>
    </div></div>`;
  const i = $('#adminpin'); setTimeout(() => i.focus(), 50);
  i.onkeydown = (e) => { if (e.key === 'Enter') submitPin(); };
}
function submitPin() {
  const v = ($('#adminpin')?.value || '').trim();
  if (!/^\d{6}$/.test(v)) { renderPinForm('请输入 6 位数字'); return; }
  LS.set('adminPin', v); loadAdmin();
}
async function loadAdmin(quiet = false) {
  if (!CFG.trackUrl) return;
  if (!quiet) $('#admin').innerHTML = `<div class="wrap">${adminHead('👑 管理')}<div class="empty">加载中…</div></div>`;
  try {
    const q = `${CFG.trackUrl}?action=admin&pin=${encodeURIComponent(adminPin())}${adminWho ? `&who=${encodeURIComponent(adminWho)}` : ''}`;
    const r = await (await fetch(q)).json();
    if (r.error) {
      if (r.error !== 'nopin') LS.del('adminPin');
      const msg = { wrong: `密码不对${r.left != null ? `（还可以试 ${r.left} 次）` : ''}`, locked: '试错太多次，请 15 分钟后再试', nopin: '还没有设定管理密码。请在 Apps Script 的「项目设置 → 脚本属性」加入 ADMIN_PIN。' }[r.error] || '出错了';
      if (r.error === 'nopin') { $('#admin').innerHTML = `<div class="wrap">${adminHead('👑 管理')}<div class="set-group">${msg}</div></div>`; return; }
      renderPinForm(msg); return;
    }
    adminData = r;
    adminWho ? renderPerson() : renderAdmin();
  } catch (e) {
    if (!quiet) $('#admin').innerHTML = `<div class="wrap">${adminHead('👑 管理')}<div class="empty">连不上表格，稍后再试</div></div>`;
  }
}
function renderAdmin() {
  const d = adminData; const on = new Set(d.online.map((n) => String(n).toLowerCase()));
  const sc = $('#admin').scrollTop;
  $('#admin').innerHTML = `<div class="wrap admin">${adminHead('👑 管理')}
    <div class="note" style="margin:-.3rem 0 .8rem">更新于 ${hm(d.at)} · 每分钟自动刷新</div>
    <div class="stats">
      <div class="stat"><b class="c-up">${d.online.length}</b><span>🟢 在线</span></div>
      <div class="stat"><b>${d.today.length}</b><span>今天用过</span></div>
      <div class="stat"><b>${d.users.length}</b><span>所有人</span></div>
    </div>
    <div class="label">🟢 在线（最近 3 分钟有打开）</div>
    ${d.online.length ? `<div class="chips" style="flex-wrap:wrap">${d.online.map((n) => `<button class="chip on" data-action="admin-person" data-who="${esc(n)}">🟢 ${esc(n)}</button>`).join('')}</div>` : '<div class="note">现在没有人在用</div>'}
    <div class="label">今天 · ${d.today.length} 人</div>
    ${d.today.length ? d.today.map((u) => `<button class="mrow" data-action="admin-person" data-who="${esc(u.name)}">
      <span class="avatar sm">${esc(String(u.name).slice(0, 1).toUpperCase())}</span>
      <span class="m-txt"><b>${on.has(String(u.name).toLowerCase()) ? '🟢 ' : ''}${esc(u.name)} <span class="note">${hm(u.first)}–${hm(u.last)}</span></b>
      <span>${esc(u.city || '')} · ${esc(u.os || '')} · ${u.actions} 个动作 · 看 ${u.reads} · 听 ${u.listens}${u.logins ? ` · 登入 ${u.logins} 次` : ''}</span></span><span class="chev">${ic('chev')}</span></button>`).join('') : '<div class="note">今天还没有人用</div>'}
    <div class="label">👥 所有人 · 最近活动排前</div>
    ${d.users.map((u) => `<button class="mrow" data-action="admin-person" data-who="${esc(u.name)}">
      <span class="avatar sm" style="${on.has(String(u.name).toLowerCase()) ? '' : 'background:var(--chip);color:var(--ink)'}">${esc(String(u.name).slice(0, 1).toUpperCase())}</span>
      <span class="m-txt"><b>${esc(u.name)} <span class="note">${agoT(u.last)}</span></b>
      <span>${esc(u.city || '—')} · ${esc(u.os || '')}${u.phones > 1 ? ` (${u.phones} 台)` : ''} · 🔥${u.streak} · 今天读 ${u.readToday} · 打开 ${u.opens} 次 · 用了 ${u.days} 天</span></span><span class="chev">${ic('chev')}</span></button>`).join('')}
    <div class="label">⚡ 最新动作</div>
    <div class="feed">${d.feed.map((x) => feedRow(x, true)).join('')}</div>
    <button class="btn" style="margin-top:1rem" data-action="admin-forget">🔒 这台手机忘记密码</button>
  </div>`;
  $('#admin').scrollTop = sc;
}
function feedRow(x, withName) {
  return `<div class="feed-row"><span class="note">${hm(x.t)}</span><span>${withName ? `<b>${esc(x.name)}</b> ` : ''}${esc(x.what)}${x.title ? `：${esc(String(x.title).slice(0, 40))}` : ''}${!x.title && x.detail ? ` <span class="note">${esc(String(x.detail).slice(0, 40))}</span>` : ''}</span></div>`;
}
function renderPerson() {
  const d = adminData; const u = d.users.find((x) => String(x.name).toLowerCase() === String(adminWho).toLowerCase()) || { name: adminWho };
  const list = d.person || [];
  $('#admin').innerHTML = `<div class="wrap admin">${adminHead(esc(u.name), true)}
    <div class="set-group">
      <div class="who">${d.online.some((n) => String(n).toLowerCase() === String(u.name).toLowerCase()) ? '🟢 在线' : `最近：${agoT(u.last)}`}</div>
      <div class="note">${esc(u.city || '—')} · ${esc(u.os || '')} · 第一次：${u.first ? new Date(u.first).toLocaleDateString('zh-CN', { timeZone: TZ }) : '—'}</div>
      <div class="note">🔥 连续 ${u.streak ?? 0} 天 · 今天读 ${u.readToday ?? 0} · 打开 ${u.opens ?? 0} 次 · 用了 ${u.days ?? 0} 天 · ${u.size || ''}</div>
    </div>
    <div class="label">最近 30 个动作</div>
    <div class="feed">${list.length ? list.map((x) => `${feedRow(x, false)}`).join('') : '<div class="note">没有记录</div>'}</div>
  </div>`;
  $('#admin').scrollTop = 0;
}
function adminAction(a, b) {
  switch (a) {
    case 'open-admin': openAdmin(); return true;
    case 'close-admin': history.back(); return true;
    case 'admin-pin': submitPin(); return true;
    case 'admin-refresh': adminPin() ? loadAdmin() : renderPinForm(); return true;
    case 'admin-person': adminWho = b.dataset.who; loadAdmin(); return true;
    case 'admin-back': adminWho = null; adminData ? renderAdmin() : loadAdmin(); return true;
    case 'admin-forget': LS.del('adminPin'); renderPinForm('已忘记密码'); return true;
  }
  return false;
}
