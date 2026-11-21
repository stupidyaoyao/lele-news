// 🔥 热度: how big a story is, from three numbers anyone can check.
//   1. how many of our sources reported it
//   2. GDELT (free world-news database): today's share of world coverage vs the past week
//   3. Wikipedia page views of the topic: yesterday vs the week before

const UA = 'LeleNews/2.1 (https://github.com/stupidyaoyao/lele-news; family news app)';
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

export async function gdeltRatio(query) {
  if (!query) return null;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=timelinevol&timespan=7d&format=json`;
  try {
    let txt = '';
    for (let i = 0; i < 4; i++) { // GitHub's shared servers often hit GDELT's 1-per-5-seconds limit: wait and retry
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      txt = await r.text();
      if (!/limit requests/i.test(txt)) break;
      await new Promise((res) => setTimeout(res, 8000 + i * 4000));
    }
    if (!txt.trim().startsWith('{')) throw new Error(txt.slice(0, 80));
    const pts = (JSON.parse(txt).timeline?.[0]?.data || []).map((p) => ({ t: Date.parse(p.date.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')), v: Number(p.value) || 0 }));
    if (pts.length < 10) return null;
    const cut = Date.now() - 24 * 3600e3;
    const avg = (a) => a.reduce((s, p) => s + p.v, 0) / (a.length || 1);
    const recent = avg(pts.filter((p) => p.t >= cut)), before = avg(pts.filter((p) => p.t < cut));
    if (!recent) return null;
    const ratio = before > 0 ? recent / before : 10;
    return { ratio: Math.round(Math.min(ratio, 50) * 10) / 10, share: Math.round(recent * 1e4) / 1e4 };
  } catch (e) { console.log(`  GDELT "${query}": ${e.message}`); return null; }
}

export async function wikiViews(title) {
  if (!title) return null;
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  const end = ymd(Date.now() - 864e5), start = ymd(Date.now() - 9 * 864e5);
  try {
    const r = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/daily/${start}/${end}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const v = (await r.json()).items?.map((i) => i.views) || [];
    if (v.length < 3) return null;
    const last = v[v.length - 1]; const base = v.slice(0, -1).reduce((a, b) => a + b, 0) / (v.length - 1);
    return { title, views: last, ratio: base > 0 ? Math.round(last / base * 10) / 10 : null };
  } catch (e) { console.log(`  Wikipedia "${title}": ${e.message}`); return null; }
}

export function heatScore(sources, gdelt, wiki) {
  let s = sources >= 18 ? 5 : sources >= 12 ? 4 : sources >= 7 ? 3 : sources >= 4 ? 2 : 1;
  if (gdelt && gdelt.ratio >= 2) s++;
  if (wiki && (wiki.ratio >= 2 || wiki.views >= 50000)) s++;
  return Math.max(1, Math.min(5, s));
}
