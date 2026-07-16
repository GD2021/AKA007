(async () => {
  const BASE = manifest?.baseUrl || 'https://memojav.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0';
  const HDR = { 'User-Agent': UA, 'Referer': `${BASE}/` };
  // DNS 确认 video10.memojav.net 为有效 CDN 节点（另有 video3.memojav.com 等备用）
  // 若 CDN 迁移，仅需修改此常量
  const CDN_HOST = 'https://video10.memojav.net';

  const CATEGORIES = [
    { name: '最佳',          slug: 'best' },
    { name: '最新',          slug: 'video' },
    { name: 'Big Tits Lover', slug: 'categories/big-tits-lover' },
    { name: 'Big Tits',      slug: 'categories/big-tits' },
    { name: 'Bodysuit',      slug: 'categories/bodysuit' },
    { name: 'Mature Woman',  slug: 'categories/mature-woman' },
    { name: 'Stepfamily',    slug: 'categories/stepfamily' },
    { name: 'Outdoor',       slug: 'categories/outdoor' },
    { name: 'MILF',          slug: 'categories/milf' },
    { name: 'Documentary',   slug: 'categories/documentary' },
  ];

  const catUrl = (slug, page) => {
    const prefix = slug === 'best' ? `${BASE}/best` : `${BASE}/${slug}`;
    return page === 1 ? `${prefix}/` : `${prefix}/page-${page}`;
  };

  const absUrl = (u) => {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    return `${BASE}${u.startsWith('/') ? '' : '/'}${u}`;
  };

  const shuffleTake = (arr, n) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  };

  const parseItems = (doc) => {
    const out = [];
    for (const a of doc.querySelectorAll('a.video-item')) {
      if (out.length >= 24) break;
      const href = a.getAttribute('href');
      const m = href?.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i);
      if (!m) continue;
      const vid = m[1];
      const title = a.querySelector('.video-title')?.textContent?.trim() || vid;
      const poster = absUrl(a.querySelector('img')?.getAttribute('src') ?? '');
      const desc = a.querySelector('.video-metadata')?.textContent?.trim();
      out.push(new MultimediaItem({ title, url: `${BASE}/video/${vid}`, posterUrl: poster, type: 'movie', description: desc || undefined }));
    }
    return out;
  };

  const parseVideoInfo = (doc) => {
    const title = doc.querySelector('h1#title')?.textContent?.trim();
    const poster = absUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '');
    let desc = doc.querySelector('p#title-description')?.textContent?.trim();
    if (!desc) desc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim();
    let year;
    for (const row of doc.querySelectorAll('table tr')) {
      const th = row.querySelector('th')?.textContent?.trim();
      const td = row.querySelector('td');
      if (!th || !td) continue;
      if (th === 'Release:') {
        const ym = td.textContent?.match(/(\d{4})/);
        if (ym) year = parseInt(ym[1], 10);
      }
    }
    return { title, poster, desc, year };
  };

  const buildSig = () => {
    const t = Date.now();
    const b = btoa(String(t));
    const sig = b.slice(b.length - 12, b.length - 2);
    let sts = 1;
    for (let i = 0; i < 10; i++) sts += sig.charCodeAt(i) * i * 1743;
    return { sig, sts };
  };

  const fetchApiStream = async (vid) => {
    const { sig, sts } = buildSig();
    const url = `${BASE}/hls/get_video_info.php?id=${encodeURIComponent(vid)}&sig=${sig}&sts=${sts}`;
    const res = await http_get(url, HDR);
    const body = String(res?.body ?? '');
    const jsonStr = body.split('for (;;);')?.[1] || body;
    try {
      const data = JSON.parse(jsonStr);
      if (data?.success && data?.url) {
        const streamUrl = decodeURIComponent(data.url);
        if (data.type === 'hls' || /\.m3u8/i.test(streamUrl)) {
          return [new StreamResult({ url: streamUrl, quality: '1080p', headers: HDR })];
        }
        return [
          new StreamResult({ url: `${streamUrl}=m22`, quality: '720p',  headers: HDR }),
          new StreamResult({ url: `${streamUrl}=m37`, quality: '1080p', headers: HDR }),
        ];
      }
    } catch {}
    return [];
  };

  const getHome = async (cb) => {
    try {
      const allItems = [];
      const home = {};
      for (const cat of CATEGORIES) {
        const pages = await Promise.all([1, 2, 3].map(async (p) => {
          const res = await http_get(catUrl(cat.slug, p), HDR);
          if (res?.status !== 200) return [];
          return parseItems(await parseHtml(res.body));
        }));
        const seen = new Set();
        const merged = ['cats', 'dogs'].flat ? pages.flat() : [].concat(...pages);
        const deduped = [];
        for (const item of merged) {
          if (!seen.has(item.url)) { seen.add(item.url); deduped.push(item); }
        }
        if (deduped.length) {
          home[cat.name] = deduped;
          allItems.push(...deduped);
        }
      }
      if (allItems.length) home.Trending = shuffleTake(allItems, 12);
      cb({ success: true, data: home });
    } catch (e) {
      cb({ success: false, errorCode: 'HOME_ERROR', message: e?.message ?? e });
    }
  };

  // 搜索不可用：memojav 使用内置 Google 站内搜索，无自有搜索 API
  const search = async (query, cb) => {
    cb({ success: true, data: [] });
  };

  const load = async (url, cb) => {
    try {
      if (!url) return cb({ success: false, errorCode: 'NO_URL' });
      const res = await http_get(url, HDR);
      if (res?.status !== 200) return cb({ success: false, errorCode: 'NOT_FOUND' });
      const doc = await parseHtml(res.body);
      const { title, poster, desc, year } = parseVideoInfo(doc);
      cb({
        success: true,
        data: new MultimediaItem({
          title: title?.slice(0, 120) || url,
          url,
          posterUrl: poster,
          bannerUrl: poster || undefined,
          description: desc || undefined,
          type: 'movie',
          year,
          episodes: [new Episode({ name: '正片', url, season: 1, episode: 1 })],
        }),
      });
    } catch (e) {
      cb({ success: false, errorCode: 'LOAD_ERROR', message: e?.message ?? e });
    }
  };

  const loadStreams = async (url, cb) => {
    try {
      if (!url) return cb({ success: true, data: [] });
      const m = url.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i);
      if (!m) return cb({ success: true, data: [] });
      const vid = m[1];
      const streams = [new StreamResult({ url: `${CDN_HOST}/stream/${vid}/master.m3u8`, quality: '720p', headers: HDR })];
      const api = await fetchApiStream(vid);
      streams.push(...api);
      cb({ success: true, data: streams });
    } catch (e) {
      cb({ success: false, errorCode: 'STREAM_ERROR', message: e?.message ?? e });
    }
  };

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
