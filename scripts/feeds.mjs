// News sources. Each feed has a default category (used if AI is off).
// Categories: finance 财经 | world 国际 | sea 东南亚 | malaysia 马来西亚 | china 中国 | tech 科技
// A feed that fails is skipped; check the Actions log to see which ones work.

const gn = (q, lang = 'zh') =>
  lang === 'zh'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-CN&gl=MY&ceid=MY:zh-Hans`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-MY&gl=MY&ceid=MY:en`;

export const FEEDS = [
  // --- Malaysian Chinese press (via Google News, since they have no public RSS) ---
  { name: '南洋商报', url: gn('site:enanyang.my'), cat: 'malaysia' },
  { name: '南洋商报·新闻', url: gn('南洋商报 when:1d'), cat: 'malaysia' },
  { name: '星洲日报', url: gn('site:sinchew.com.my when:1d'), cat: 'malaysia' },
  { name: '东方日报', url: gn('site:orientaldaily.com.my'), cat: 'malaysia' },
  { name: '中国报', url: gn('site:chinapress.com.my'), cat: 'malaysia' },
  { name: '马来西亚财经', url: gn('马股 OR 令吉 OR 大马经济 when:1d'), cat: 'finance' },

  // --- 联合早报 ---
  { name: '联合早报', url: gn('site:zaobao.com.sg when:1d'), cat: 'world' },
  { name: '联合早报·财经', url: gn('site:zaobao.com.sg 财经 OR 股市 OR 经济 when:1d'), cat: 'finance' },

  // --- Chinese-language international ---
  { name: 'BBC 中文', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', cat: 'world' },
  { name: '纽约时报中文网', url: 'https://cn.nytimes.com/rss/', cat: 'world' },

  // --- Malaysia (English) ---
  { name: 'The Star Business', url: gn('site:thestar.com.my business when:1d', 'en'), cat: 'finance' },
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
  // --- v2: more sources (each capped so no single source floods the AI) ---
  // Malaysian Chinese
  { name: '光明日报', url: gn('site:guangming.com.my'), cat: 'malaysia', max: 12 },
  { name: '诗华日报', url: gn('site:seehua.com'), cat: 'malaysia', max: 10 },
  { name: '星洲日报·财经', url: gn('site:sinchew.com.my 财经 OR 股 OR 令吉'), cat: 'finance', max: 10 },
  // Malaysia English / Malay
  { name: 'Bernama', url: gn('site:bernama.com when:1d', 'en'), cat: 'malaysia', max: 12 },
  { name: 'Malay Mail', url: gn('site:malaymail.com when:1d', 'en'), cat: 'malaysia', max: 10 },
  { name: 'NST Business', url: gn('site:nst.com.my business when:1d', 'en'), cat: 'finance', max: 10 },
  { name: 'Berita Harian', url: gn('site:bharian.com.my when:1d', 'en'), cat: 'malaysia', max: 8 },
  // Finance
  { name: 'Reuters Markets', url: gn('site:reuters.com markets OR business when:1d', 'en'), cat: 'finance', max: 12 },
  { name: 'Reuters World', url: gn('site:reuters.com world when:1d', 'en'), cat: 'world', max: 12 },
  { name: 'AP News', url: gn('site:apnews.com when:1d', 'en'), cat: 'world', max: 10 },
  { name: '华尔街见闻', url: gn('site:wallstreetcn.com'), cat: 'finance', max: 10 },
  { name: 'Kitco', url: gn('site:kitco.com gold when:2d', 'en'), cat: 'finance', max: 6 },
  { name: 'CNBC Asia', url: 'https://www.cnbc.com/id/19832390/device/rss/rss.html', cat: 'finance', max: 10 },
  // Southeast Asia
  { name: 'The Straits Times', url: 'https://www.straitstimes.com/news/asia/rss.xml', cat: 'sea', max: 10 },
  { name: 'Bangkok Post', url: 'https://www.bangkokpost.com/rss/data/topstories.xml', cat: 'sea', max: 8 },
  { name: 'VnExpress', url: 'https://e.vnexpress.net/rss/news.rss', cat: 'sea', max: 8 },
  { name: 'Jakarta Post', url: gn('site:thejakartapost.com when:1d', 'en'), cat: 'sea', max: 8 },
  { name: 'Rappler', url: 'https://www.rappler.com/feed/', cat: 'sea', max: 8 },
  // World
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', cat: 'world', max: 12 },
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', cat: 'finance', max: 10 },
  { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-world', cat: 'world', max: 8 },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', cat: 'world', max: 8 },
  { name: 'NHK World', url: gn('site:www3.nhk.or.jp/nhkworld when:1d', 'en'), cat: 'world', max: 8 },
  // China
  { name: 'SCMP China', url: gn('site:scmp.com china when:1d', 'en'), cat: 'china', max: 10 },
  { name: 'Caixin Global', url: gn('site:caixinglobal.com', 'en'), cat: 'china', max: 8 },
  // Tech
  { name: '36氪', url: 'https://36kr.com/feed', cat: 'tech', max: 10 },
  { name: '爱范儿', url: 'https://www.ifanr.com/feed', cat: 'tech', max: 8 },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', cat: 'tech', max: 8 },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', cat: 'tech', max: 8 },
  { name: 'Rest of World', url: 'https://restofworld.org/feed/latest/', cat: 'tech', max: 6 },
];

export const CATEGORIES = ['finance', 'world', 'sea', 'malaysia', 'china', 'tech'];
