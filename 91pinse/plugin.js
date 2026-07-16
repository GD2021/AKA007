(async () => {
  const BASE = manifest?.baseUrl || 'https://91pinse.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const HDR = { 'User-Agent': UA, 'Referer': `${BASE}/`, 'Accept-Language': 'zh-CN,zh;q=0.9' };

  const CATEGORIES = [
    { id: 'weekly-hot',   name: '每周热门', url: '/rank/weekly-hot' },
    { id: 'month-hot',    name: '每月热门', url: '/rank/month-hot' },
    { id: '熟女', name: '熟女' },
    { id: '阿姨', name: '阿姨' },
    { id: '巨乳', name: '巨乳' },
    { id: '大奶', name: '大奶' },
    { id: '少妇', name: '少妇' },
    { id: '眼镜', name: '眼镜' },
    { id: '口爆', name: '口爆' },
    { id: '露脸', name: '露脸' },
    { id: '老阿姨', name: '老阿姨' },
    { id: '技师', name: '技师' },
    { id: '打炮', name: '打炮' },
    { id: '体育生', name: '体育生' },
  ];

  const KEYWORD_CATS = new Set(CATEGORIES.filter(c => !c.url).map(c => c.id));

  // ── helpers ──
  const cleanText = (str) => (str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const catPageUrl = (cat, page) => {
    if (cat.url) return page <= 1 ? BASE + cat.url : `${BASE}${cat.url}?page=${page}`;
    return `${BASE}/v/search?keyword=${encodeURIComponent(cat.id)}&page=${page}`;
  };

  const searchUrl = (keyword, page) =>
    `${BASE}/v/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;

  const detailUrl = (id) => `${BASE}/v/${id}`;

  const extractM3u8 = (html) => {
    const m = html.match(/var\s+_[a-z0-9]+\s*=\s*'([^']+)'/);
    if (!m) return '';
    try {
      // JSON.parse 一次性处理所有 \uXXXX 转义，替代 5 次链式 .replace()
      const raw = JSON.parse(`"${m[1]}"`);
      const decoded = atob(raw);
      return /^https?:\/\/.+\.m3u8(\?.*)?$/i.test(decoded) ? decoded : '';
    } catch { return ''; }
  };

  // ── parsers ──
  const parseList = async (html, refUrl) => {
    const doc = await parseHtml(html);
    const articles = doc.querySelectorAll('article.video-card');
    if (!articles.length) {
      const seen = new Set();
      const items = [];
      const hrefRegex = /href="\/v\/(\d+)"/g;
      let m;
      while ((m = hrefRegex.exec(html)) !== null && items.length < 24) {
        const id = m[1];
        if (id.length < 5 || seen.has(id)) continue;
        seen.add(id);
        items.push(new MultimediaItem({ title: `Video ${id}`, url: id, posterUrl: '', type: 'movie' }));
      }
      return items;
    }
    const items = [];
    const seen = new Set();
    for (const article of articles) {
      if (items.length >= 24) break;
      const link = article.querySelector('a[href*="/v/"]');
      const href = link?.getAttribute('href');
      const m = href?.match(/\/v\/(\d+)/);
      if (!m) continue;
      const id = m[1];
      if (id.length < 5 || seen.has(id)) continue;
      seen.add(id);

      const title = article.querySelector('.video-card-title')?.getAttribute('title')
        || article.querySelector('.video-card-title')?.textContent?.trim()
        || `Video ${id}`;

      const img = article.querySelector('img.video-thumb-img');
      const poster = img ? fixUrl(img.getAttribute('src') || '', refUrl) : '';

      const durEl = article.querySelector('.video-duration');
      const dur = durEl?.textContent?.trim() || '';

      const authorEl = article.querySelector('.video-card-author');
      let author = '';
      if (authorEl) {
        const authorSpan = authorEl.querySelector('span');
        author = (authorSpan || authorEl).textContent?.trim() || '';
      }

      items.push(new MultimediaItem({
        title,
        url: id,
        posterUrl: poster,
        type: 'movie',
        description: (dur || author) || undefined,
      }));
    }
    return items;
  };

  const parseVideoInfo = (doc, html, baseUrl) => {
    let title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    if (!title) {
      const h1 = doc.querySelector('h1');
      if (h1) title = h1.textContent?.trim() || '';
    }
    title = title.replace(/\s*-\s*91PinSe\s*$/, '').trim();
    if (!title) {
      const idMatch = baseUrl?.match(/\/v\/(\d+)/);
      title = idMatch ? `Video ${idMatch[1]}` : 'Unknown';
    }

    const ogImg = doc.querySelector('meta[property="og:image"]') || doc.querySelector('meta[property="og_image"]');
    const poster = ogImg ? fixUrl(ogImg.getAttribute('content') || '', baseUrl) : '';

    const authorMatch = html.match(/href\s*=\s*["']\/v\/author\/["'][^>]*>([^<]+)<\/a>/);
    const author = authorMatch ? cleanText(authorMatch[1]) : '';

    const m3u8Url = extractM3u8(html);

    return { title, poster, author, m3u8Url };
  };

  // ── fixUrl ──
  const fixUrl = (u, base) => {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    return (base || BASE) + (u.startsWith('/') ? '' : '/') + u;
  };

  // ── core exports ──
  const getHome = async (cb) => {
    try {
      const home = {};
      await Promise.all(CATEGORIES.map(async (cat) => {
        try {
          const url = catPageUrl(cat, 1);
          const res = await http_get(url, HDR);
          if (res?.status !== 200) return;
          const items = await parseList(res.body, url);
          if (items.length) home[cat.name] = items;
        } catch {}
      }));
      cb({ success: true, data: home });
    } catch (e) {
      cb({ success: false, errorCode: 'HOME_ERROR', message: e?.message ?? e });
    }
  };

  const search = async (query, cb) => {
    try {
      const q = String(query || '').trim();
      if (!q) return cb({ success: true, data: [] });
      const res = await http_get(searchUrl(q, 1), HDR);
      if (res?.status !== 200) return cb({ success: true, data: [] });
      const items = await parseList(res.body, searchUrl(q, 1));
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: 'SEARCH_ERROR', message: e?.message ?? e });
    }
  };

  const load = async (url, cb) => {
    try {
      const id = String(url || '').trim();
      if (!id || !/^\d+$/.test(id)) return cb({ success: false, errorCode: 'INVALID_ID' });

      const detailUrl_ = detailUrl(id);
      const res = await http_get(detailUrl_, HDR);
      if (res?.status !== 200) return cb({ success: false, errorCode: 'NOT_FOUND' });

      const html = String(res.body || '');
      const doc = await parseHtml(html);
      const { title, poster, author, m3u8Url } = parseVideoInfo(doc, html, detailUrl_);

      const cast = author ? [new Actor({ name: author })] : [];

      cb({
        success: true,
        data: new MultimediaItem({
          title: title.substring(0, 120),
          url: id,
          posterUrl: poster,
          bannerUrl: poster || undefined,
          description: author || undefined,
          type: 'movie',
          cast: cast.length ? cast : undefined,
          episodes: [new Episode({
            name: '正片',
            url: m3u8Url || id,
            season: 1,
            episode: 1,
          })],
        }),
      });
    } catch (e) {
      cb({ success: false, errorCode: 'LOAD_ERROR', message: e?.message ?? e });
    }
  };

  const loadStreams = async (url, cb) => {
    try {
      const raw = String(url || '').trim();
      if (!raw) return cb({ success: true, data: [] });

      // 直接 m3u8 链接
      if (/\.m3u8(?:\?|$)/i.test(raw)) {
        return cb({ success: true, data: [new StreamResult({ url: raw, quality: '720p', headers: HDR })] });
      }

      // 数字 ID → 回查详情页提取 m3u8
      if (/^\d+$/.test(raw)) {
        const res = await http_get(detailUrl(raw), HDR);
        const html = String(res?.body || '');
        const m3u8Url = extractM3u8(html);
        if (m3u8Url) {
          return cb({ success: true, data: [new StreamResult({ url: m3u8Url, quality: '720p', headers: HDR })] });
        }
      }

      cb({ success: true, data: [] });
    } catch (e) {
      cb({ success: false, errorCode: 'STREAM_ERROR', message: e?.message ?? e });
    }
  };

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
