(async () => {
  const BASE = manifest?.baseUrl || 'https://hsex.tv';
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  const HDR = { 'User-Agent': UA, 'Referer': `${BASE}/` };

  const CATEGORIES = [
    { tid: 'list',      name: '最新视频' },
    { tid: 'top7_list', name: '周榜热门' },
    { tid: 'top_list',  name: '月榜热门' },
    { tid: '5min_list', name: '5分钟+' },
    { tid: 'long_list', name: '10分钟+' },
    { tid: 'search',    name: '熟女', keyword: '熟女' },
    { tid: 'search',    name: '足疗', keyword: '足疗' },
  ];

  const catUrl = (cat, page) =>
    cat.tid === 'search'
      ? `${BASE}/search-${page}.htm?search=${encodeURIComponent(cat.keyword)}&sort=new`
      : `${BASE}/${cat.tid}-${page}.htm`;

  const searchUrl = (keyword, page) =>
    `${BASE}/search-${page}.htm?search=${encodeURIComponent(keyword)}&sort=new`;

  const detailUrl = (id) => `${BASE}/video-${id}.htm`;

  const fixUrl = (u) => {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    return BASE + (u.startsWith('/') ? '' : '/') + u;
  };

  const extractM3u8 = (html) => {
    const m = html.match(/(https:\/\/(?:cdn|cdn1|shark)\.hdcdn\.online\/[^\s"'<>]+\/hls\/[^/]+\/index\.m3u8)/);
    return m ? m[1] : '';
  };

  const parseList = async (html, refUrl) => {
    const doc = await parseHtml(html);
    let cards = doc.querySelectorAll('div[class*="thumbnail"]');
    if (!cards?.length) {
      const fallback = [];
      const seen = new Set();
      const hrefRe = /href="[^"]*video-(\d+)\.htm/gi;
      let m;
      while ((m = hrefRe.exec(html)) !== null && fallback.length < 24) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        fallback.push(new MultimediaItem({ title: `Video ${id}`, url: detailUrl(id), posterUrl: '', type: 'movie' }));
      }
      return fallback;
    }

    const items = [];
    const seen = new Set();
    for (const card of cards) {
      if (items.length >= 24) break;
      const link = card.querySelector('a[href*="video-"]');
      const href = link?.getAttribute('href');
      const idMatch = href?.match(/video-(\d+)\.htm/i);
      if (!idMatch) continue;
      const id = idMatch[1];
      if (seen.has(id)) continue;
      seen.add(id);

      const style = link?.getAttribute('style') || '';
      const bgMatch = style.match(/background:\s*url\(['"]?([^'")]+)['"]?\)/i);
      const poster = bgMatch ? fixUrl(bgMatch[1]) : '';

      const titleEl = card.querySelector('h5 a');
      let title = titleEl?.textContent?.trim() || '';
      if (!title) {
        const h5 = card.querySelector('h5');
        title = h5?.textContent?.trim() || '';
      }
      title = title.replace(/<[^>]+>/g, '').trim() || `Video ${id}`;

      const durEl = card.querySelector('span[class*="duration"]');
      const dur = durEl?.textContent?.trim() || '';

      items.push(new MultimediaItem({
        title: title.substring(0, 120),
        url: detailUrl(id),
        posterUrl: poster,
        type: 'movie',
        description: dur || undefined,
      }));
    }
    return items;
  };

  const parseVideoInfo = (doc, html) => {
    const panelTitle = doc.querySelector('h3.panel-title');
    let title = panelTitle?.textContent?.trim() || '';
    if (!title) {
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      title = ogTitle?.getAttribute('content') || '';
    }
    if (!title) {
      const titleTag = doc.querySelector('title');
      if (titleTag) title = titleTag.textContent?.split('-')[0]?.trim() || '';
    }

    let poster = '';
    const videoEl = doc.querySelector('video');
    if (videoEl) poster = fixUrl(videoEl.getAttribute('poster') || '');
    if (!poster) {
      const ogImg = doc.querySelector('meta[property="og:image"]');
      if (ogImg) poster = fixUrl(ogImg.getAttribute('content') || '');
    }
    if (!poster) {
      const imgRe = /<img[^>]+src=["']([^"']+\.(?:jpg|webp|png))[^"']*["'][^>]*\/?>/i;
      const imgMatch = html.match(imgRe);
      if (imgMatch) poster = fixUrl(imgMatch[1]);
    }

    const m3u8Url = extractM3u8(html);

    return { title, poster, m3u8Url };
  };

  const getHome = async (cb) => {
    try {
      const home = {};
      await Promise.all(CATEGORIES.map(async (cat) => {
        try {
          const url = catUrl(cat, 1);
          const res = await http_get(url, HDR);
          if (res?.status !== 200) return;
          const items = await parseList(res.body ?? '', url);
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
      const q = String(query ?? '').trim();
      if (!q) return cb({ success: true, data: [] });
      const url = searchUrl(q, 1);
      const res = await http_get(url, HDR);
      if (res?.status !== 200) return cb({ success: true, data: [] });
      const items = await parseList(res.body ?? '', url);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: 'SEARCH_ERROR', message: e?.message ?? e });
    }
  };

  const load = async (url, cb) => {
    try {
      const id = String(url ?? '').trim();
      if (!id || !/^\d+$/.test(id)) return cb({ success: false, errorCode: 'INVALID_ID' });

      const pageUrl = detailUrl(id);
      const res = await http_get(pageUrl, HDR);
      if (res?.status !== 200) return cb({ success: false, errorCode: 'NOT_FOUND' });

      const html = res.body ?? '';
      const doc = await parseHtml(html);
      const { title, poster, m3u8Url } = parseVideoInfo(doc, html);

      const ep = m3u8Url
        ? new Episode({
            name: '正片',
            url: pageUrl,
            season: 1,
            episode: 1,
            streams: [new StreamResult({ url: m3u8Url, quality: '720p', headers: HDR })],
          })
        : new Episode({
            name: '正片',
            url: pageUrl,
            season: 1,
            episode: 1,
          });

      cb({
        success: true,
        data: new MultimediaItem({
          title: (title || `Video ${id}`).substring(0, 120),
          url: pageUrl,
          posterUrl: poster || '',
          type: 'movie',
          episodes: [ep],
        }),
      });
    } catch (e) {
      cb({ success: false, errorCode: 'LOAD_ERROR', message: e?.message ?? e });
    }
  };

  const loadStreams = async (url, cb) => {
    try {
      const raw = String(url ?? '').trim();
      if (!raw) return cb({ success: true, data: [] });

      if (/\.(m3u8|mp4|flv|mkv|ts)(\?|$|#)/i.test(raw)) {
        return cb({
          success: true,
          data: [new StreamResult({ url: raw, quality: '720p', headers: HDR })],
        });
      }

      if (/^\d+$/.test(raw)) {
        const res = await http_get(detailUrl(raw), HDR);
        const html = res?.body ?? '';
        const m3u8Url = extractM3u8(html);
        if (m3u8Url) {
          return cb({
            success: true,
            data: [new StreamResult({ url: m3u8Url, quality: '720p', headers: HDR })],
          });
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
