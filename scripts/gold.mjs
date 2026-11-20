// Gold prices for the 💰 card. Writes data/gold.json.
// - Spot price in MYR per gram (xaus.com, free, no key)
// - Change vs yesterday + 7-day trend from xaus daily history (USD), scaled to MYR
// - Kijang Emas buy/sell from Bank Negara Malaysia Open API (official, daily)
// Each part is optional: if a source fails, the card shows what it has.

import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/gold.json', import.meta.url);
const UA = { 'User-Agent': 'Mozilla/5.0 (LeLeNews)' };

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

export async function updateGold() {
  let old = {};
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const out = { ...old, updated: new Date().toISOString(), errors: [] };

  // 1) Spot, MYR per gram (999.9)
  try {
    const s = await getJson('https://xaus.com/api/v1/spot?currency=MYR&unit=gram&compact=1');
    const g999 = Number(s.xau?.price);
    if (!g999) throw new Error('no price');
    out.spot = {
      g999: +g999.toFixed(2),
      g916: +(g999 * 0.916).toFixed(2),
      oz: +(g999 * 31.1034768).toFixed(0),
      usdOz: s.spot_usd_oz,
      myrPerUsd: s.spot_usd_oz ? +(g999 * 31.1034768 / s.spot_usd_oz).toFixed(4) : null,
      asOf: s.price_as_of || s.updated_at,
    };
  } catch (e) { out.errors.push('spot: ' + e.message); }

  // 2) Daily history (up to 1 year) -> change vs yesterday + chart for 1周/1个月/3个月/1年.
  //    Each day is converted with THAT day's USD->MYR rate (ECB data via Frankfurter),
  //    so ringgit moves don't distort the chart. Falls back to today's rate if FX fails.
  try {
    const h = await getJson('https://xaus.com/api/v1/history');
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' });
    const yearAgo = new Date(Date.now() - 370 * 864e5).toISOString().slice(0, 10);
    const pts = (h.points || []).filter((p) => p.d && p.c && p.d >= yearAgo && p.d < today).sort((a, b) => a.d.localeCompare(b.d));
    const fxNow = out.spot?.myrPerUsd;
    let fx = {};
    for (const url of [
      `https://api.frankfurter.dev/v1/${yearAgo}..?base=USD&symbols=MYR`,
      `https://api.frankfurter.app/${yearAgo}..?from=USD&to=MYR`,
    ]) {
      try { const r = await getJson(url); for (const [d, v] of Object.entries(r.rates || {})) if (v.MYR) fx[d] = v.MYR; if (Object.keys(fx).length) break; } catch {}
    }
    const fxDays = Object.keys(fx).sort();
    out.fxApprox = fxDays.length === 0;
    const rateOn = (d) => { // that day's rate, or the latest earlier one (weekends/holidays)
      let r = null; for (const k of fxDays) { if (k <= d) r = fx[k]; else break; } return r || fxNow;
    };
    if (pts.length && fxNow) {
      out.history = pts.map((p) => ({ d: p.d, g999: +((p.c * rateOn(p.d)) / 31.1034768).toFixed(2) }));
      const prev = out.history[out.history.length - 1];
      if (prev && out.spot) {
        out.spot.changeG999 = +(out.spot.g999 - prev.g999).toFixed(2);
        out.spot.changePct = +((out.spot.g999 / prev.g999 - 1) * 100).toFixed(2);
      }
      if (out.spot) out.history.push({ d: today, g999: out.spot.g999 });
      out.trend = out.history.slice(-8); // older app versions
    }
  } catch (e) { out.errors.push('history: ' + e.message); }

  // 3) Kijang Emas (BNM)
  try {
    const k = await getJson('https://api.bnm.gov.my/public/kijang-emas', { Accept: 'application/vnd.BNM.API.v1+json' });
    const d = Array.isArray(k.data) ? k.data[k.data.length - 1] : k.data;
    if (!d?.one_oz) throw new Error('unexpected shape');
    out.kijang = {
      date: d.effective_date,
      oz: { buy: d.one_oz.buying, sell: d.one_oz.selling },
      halfOz: d.half_oz ? { buy: d.half_oz.buying, sell: d.half_oz.selling } : null,
      quarterOz: d.quarter_oz ? { buy: d.quarter_oz.buying, sell: d.quarter_oz.selling } : null,
    };
  } catch (e) { out.errors.push('kijang: ' + e.message); }

  await writeFile(OUT, JSON.stringify(out, null, 1));
  console.log('Gold:', out.spot ? `999 RM${out.spot.g999}/g (${out.spot.changePct ?? '?'}%)` : 'no spot', out.kijang ? `Kijang ${out.kijang.date}` : 'no kijang', out.errors.join(' | '));
}
