/**
 * 乐乐新闻 Happy News: tracking + favourites backend (Google Apps Script)
 *
 * Paste this into Extensions → Apps Script of your Google Sheet, then
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *
 * Tabs it creates (automatically, on first use):
 *   用户总览  one row per phone: name, city, first/last seen, visits, days used, streak, settings
 *   动作记录  every action (open, read, 详细版, star, search, listen …)
 *   收藏      favourites saved under each name (so they come back on a new phone)
 */

const TZ = 'Asia/Kuala_Lumpur';
const USERS = '用户总览';
const EVENTS = '动作记录';
const FAVS = '收藏';

const USER_HEADERS = ['设备ID', '名字', '城市', '州/地区', '国家', '手机', '首次打开', '最近活动', '打开次数', '使用天数', '连续天数🔥', '今天已读', '字体', '颜色', '已加到桌面', '版本', '_lastDay'];
const EVENT_HEADERS = ['时间', '名字', '城市', '动作', '新闻标题', '详情', '设备ID', '新闻ID', '手机'];
const FAV_HEADERS = ['名字', '新闻标题', '来源', '收藏时间', '新闻ID', '_data'];

const LABELS = {
  open: '打开app', name_set: '填了名字', rename: '改名字', onboard_step: '导览', onboard_done: '完成导览',
  detail: '看详细版', link: '去新闻网站', read: '已读', star: '⭐收藏', unstar: '取消收藏',
  like: '👍', dislike: '👎', unlike: '取消👍👎', listen: '🎧开始收听', listen_done: '🎧听完',
  search: '🔍搜索', finish: '✅今天看完', settings: '改设置', topics: '改类别', tab: '切换页面', gold: '💰看金价',
  gold_range: '💰金价走势', login: '登入', switch_user: '换人登入', logout: '🚪退出',
};

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#fff1e8');
  } else if (sh.getLastColumn() < headers.length) { // new columns added in a later version
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#fff1e8');
  }
  return sh;
}
const now_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
const day_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const fmt_ = (iso) => { try { return Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return now_(); } };
const key_ = (name) => String(name || '').trim().toLowerCase();

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    const events = Array.isArray(p.events) ? p.events.slice(0, 300) : [];
    logEvents_(p, events);
    updateUser_(p, events);
    updateFavs_(p, events);
  } catch (err) {
    console.error(err);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'favs') {
    const k = key_(e.parameter.name);
    const sh = sheet_(FAVS, FAV_HEADERS);
    const rows = sh.getDataRange().getValues().slice(1);
    const favs = rows.filter((r) => key_(r[0]) === k && r[5])
      .map((r) => { try { return JSON.parse(r[5]); } catch (x) { return null; } })
      .filter(Boolean);
    return ContentService.createTextOutput(JSON.stringify({ favs })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('乐乐新闻 tracker is running ✅');
}

function logEvents_(p, events) {
  if (!events.length) return;
  const sh = sheet_(EVENTS, EVENT_HEADERS);
  const rows = events.map((ev) => {
    const extra = Object.assign({}, ev);
    ['t', 'ev', 'id', 'title', 'story', 'who'].forEach((k) => delete extra[k]);
    let label = LABELS[ev.ev] || ev.ev;
    if (ev.ev === 'onboard_step') label = `导览第${ev.step}步`;
    if (ev.ev === 'open' && ev.resume) label = '回到app';
    const detail = Object.keys(extra).filter((k) => !(ev.ev === 'onboard_step' && k === 'step') && !(ev.ev === 'open' && k === 'resume'))
      .map((k) => `${k}: ${extra[k]}`).join(', ');
    const who = ev.who !== undefined ? ev.who : p.name;
    return [fmt_(ev.t), who || '(未登入)', p.city || '', label, ev.title || '', detail, p.device || '', ev.id || '', p.os || ''];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
}

function updateUser_(p, events) {
  if (!p.device) return;
  const sh = sheet_(USERS, USER_HEADERS);
  const data = sh.getDataRange().getValues();
  let r = data.findIndex((row, i) => i > 0 && row[0] === p.device);
  const opens = events.filter((e) => e.ev === 'open').length;
  const today = 'd' + day_(); // text, so Sheets doesn't turn it into a date
  if (r < 0) {
    sh.appendRow([p.device, p.name || '', p.city || '', p.region || '', p.country || '', p.os || '', now_(), now_(), opens, 1, p.streak || 0, p.readToday || 0,
      p.size === 'large' ? '大字' : '标准', { light: '白', dark: '黑', auto: '跟手机' }[p.theme] || '', p.standalone ? '是' : '否', p.version || '', today]);
    return;
  }
  const row = data[r];
  const newDay = String(row[16]) !== today;
  const vals = [p.device, p.name || row[1], p.city || row[2], p.region || row[3], p.country || row[4], p.os || row[5], row[6], now_(),
    Number(row[8] || 0) + opens, Number(row[9] || 0) + (newDay ? 1 : 0), p.streak || 0, p.readToday || 0,
    p.size === 'large' ? '大字' : '标准', { light: '白', dark: '黑', auto: '跟手机' }[p.theme] || row[13], p.standalone ? '是' : row[14], p.version || row[15], today];
  sh.getRange(r + 1, 1, 1, vals.length).setValues([vals]);
}

function updateFavs_(p, events) {
  const favEvents = events.filter((e) => e.ev === 'star' || e.ev === 'unstar');
  if (!favEvents.length || !p.name) return;
  const sh = sheet_(FAVS, FAV_HEADERS);
  const k = key_(p.name);
  favEvents.forEach((ev) => {
    const data = sh.getDataRange().getValues();
    const idx = data.findIndex((row, i) => i > 0 && key_(row[0]) === k && row[4] === ev.id);
    if (ev.ev === 'star' && idx < 0 && ev.story) {
      const s = ev.story;
      sh.appendRow([p.name, s.zh || s.title || '', s.source || '', fmt_(ev.t), ev.id, JSON.stringify(s)]);
    }
    if (ev.ev === 'unstar' && idx > 0) sh.deleteRow(idx + 1);
  });
}
