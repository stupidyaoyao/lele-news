// News sources. Each feed has a default category (used if AI is off).
// Categories: finance 财经 | world 国际 | sea 东南亚 | malaysia 马来西亚 | china 中国 | tech 科技
// A feed that fails is skipped; check the Actions log to see which ones work.

const gn = (q, lang = 'zh') =>
  lang === 'zh'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-CN&gl=MY&ceid=MY:zh-Hans`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-MY&gl=MY&ceid=MY:en`;

export const FEEDS = [
  // --- Malaysian Chinese press (via Google News, since they have no public RSS) ---
  { name: '南洋商报', url: gn('site:enanyang.my when:1d'), cat: 'malaysia' },
  { name: '星洲日报', url: gn('site:sinchew.com.my when:1d'), cat: 'malaysia' },
  { name: '南洋商报·财经', url: gn('site:enanyang.my 财经 OR 股市 OR 令吉 when:1d'), cat: 'finance' },

  // --- 联合早报 ---
  { name: '联合早报', url: gn('site:zaobao.com.sg when:1d'), cat: 'world' },
  { name: '联合早报·国际', url: 'https://rsshub.app/zaobao/realtime/world', cat: 'world' },
  { name: '联合早报·中国', url: 'https://rsshub.app/zaobao/realtime/china', cat: 'china' },

  // --- Chinese-language international ---
  { name: 'BBC 中文', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', cat: 'world' },
  { name: '纽约时报中文网', url: 'https://cn.nytimes.com/rss/', cat: 'world' },

  // --- Malaysia (English) ---
  { name: 'The Star Business', url: 'https://www.thestar.com.my/rss/Business/Business-News', cat: 'finance' },
  { name: 'Free Malaysia Today', url: 'https://cms.freemalaysiatoday.com/feed', cat: 'malaysia' },
  { name: 'Malaysiakini', url: 'https://www.malaysiakini.com/rss/en/news.rss', cat: 'malaysia' },
  { name: 'The Edge Malaysia', url: gn('site:theedgemalaysia.com when:1d', 'en'), cat: 'finance' },

  // --- Southeast Asia ---
  { name: 'CNA Asia', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511', cat: 'sea' },
  { name: 'CNA Business', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936', cat: 'finance' },
  { name: 'SEA news', url: gn('ASEAN OR "Southeast Asia" economy when:1d', 'en'), cat: 'sea' },

  // --- World (English) ---
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', cat: 'world' },
  { name: 'The Guardian Business', url: 'https://www.theguardian.com/business/rss', cat: 'finance' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', cat: 'world' },
  { name: 'Global markets', url: gn('global markets stocks oil Fed when:1d', 'en'), cat: 'finance' },
];

export const CATEGORIES = ['finance', 'world', 'sea', 'malaysia', 'china', 'tech'];
