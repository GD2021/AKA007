(function () {
    'use strict';

    const BASE = (typeof manifest !== 'undefined' && manifest?.baseUrl) || 'https://kanav.ad';
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' };

    const CATEGORIES = [
        { tid: '1',  name: '中文字幕' },
        { tid: '2',  name: '日韩有码' },
        { tid: '3',  name: '日韩无码' },
        { tid: '4',  name: '国产AV' },
        { tid: '22', name: '流出自拍' },
        { tid: '20', name: '动漫番剧' },
        { tid: '第一视角', name: '第一视角' },
        { tid: '眼镜', name: '眼镜' },
        { tid: '巨臀', name: '巨臀' },
        { tid: '成熟的女人', name: '成熟的女人' },
        { tid: '婆婆', name: '婆婆' },
        { tid: '女上司', name: '女上司' },
        { tid: '臀穴', name: '臀穴' },
        { tid: '女优', name: '女优' },
        { tid: '巨乳', name: '巨乳' },
        { tid: '记录片', name: '记录片' }
    ];

    const CARD = 'div.col-md-3.col-sm-6.col-xs-6';

    const KEYWORD_TIDS = CATEGORIES.reduce((m, c) => {
        if (isNaN(Number(c.tid))) m[c.tid] = true;
        return m;
    }, {});
    const isKeywordType = (tid) => !!KEYWORD_TIDS[tid];

    const catPageUrl = (tid, sort, page) => isKeywordType(tid)
        ? `${BASE}/index.php/vod/search/by/${sort}/page/${page}/wd/${encodeURIComponent(tid)}.html`
        : `${BASE}/index.php/vod/show/by/${sort}/id/${tid}/page/${page}.html`;
    const searchUrl = (kw, sort, page) => `${BASE}/index.php/vod/search/by/${sort}/page/${page}/wd/${encodeURIComponent(kw)}.html`;
    const playPageUrl = (id) => `${BASE}/index.php/vod/play/id/${id}/sid/1/nid/1.html`;

    const extractId = (u) => {
        if (!u) return '';
        const m = String(u).match(/\/vod\/play\/id\/(\d+)/);
        return m ? m[1] : (/^\d+$/.test(String(u).trim()) ? String(u).trim() : '');
    };
    const fixUrl = (u, base) => {
        if (!u) return '';
        if (u.startsWith('//')) return 'https:' + u;
        if (u.startsWith('http')) return u;
        if (u.startsWith('/')) return (base || BASE).replace(/\/+$/, '') + u;
        try { return new URL(u, base || BASE).href; } catch (_) { return ''; }
    };

    const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'", apos: "'" };
    const decodeEntities = (s) => (s || '')
        .replace(/&([a-z]+|#\d+);/gi, (_, c) => {
            if (c[0] === '#') return String.fromCharCode(parseInt(c.slice(1), 10) || 0);
            return ENT[c.toLowerCase()] ?? _;
        })
        .replace(/\s+/g, ' ').trim();

    const meta = async (html, sel, attr = 'content') => {
        const r = await parse_html(html, sel, attr);
        const hit = r[0];
        if (!hit) return '';
        return decodeEntities(attr ? (hit.attr || '') : (hit.text || ''));
    };

    const domPoster = async (html) => {
        const doc = await parse_dom(html);
        const img = doc.querySelector('.countext-img') || doc.querySelector('.stui-pannel__detail img, .detail-info img, img[data-original]');
        return fixUrl(img?.getAttribute('data-original') || img?.getAttribute('src') || '');
    };

    const domText = async (html, sel) => {
        const doc = await parse_dom(html);
        const el = doc.querySelector(sel);
        return el ? decodeEntities(el.textContent) : '';
    };

    const domYear = async (html) => {
        const m = String(html).match(/上映日期[：:]\s*(\d{4})-/);
        return m ? parseInt(m[1], 10) : 0;
    };

    const parseDuration = (s) => {
        const t = decodeEntities(s);
        let m = 0;
        const h = t.match(/(\d+)\s*小时/); if (h) m += parseInt(h[1], 10) * 60;
        const min = t.match(/(\d+)\s*分钟/); if (min) m += parseInt(min[1], 10);
        return m || 0;
    };

    async function parseList(html) {
        const doc = await parse_dom(html);
        const items = [];
        const cards = doc.querySelectorAll(CARD);
        for (const card of cards) {
            if (items.length >= 24) break;
            const link = card.querySelector('a[href*="/vod/play/"]');
            const href = link?.getAttribute('href') || '';
            const id = (href.match(/\/id\/(\d+)/) || [])[1];
            if (!id) continue;
            const img = card.querySelector('img');
            const pic = fixUrl(img?.getAttribute('data-original') || img?.getAttribute('src') || '');
            const title = decodeEntities(img?.getAttribute('alt') || link?.getAttribute('title') || '') || ('视频 ' + id);
            const durEl = card.querySelector('.model-view');
            const duration = durEl ? parseDuration(durEl.textContent) : 0;
            items.push(new MultimediaItem({
                title, url: id, posterUrl: pic, type: 'movie',
                ...(duration ? { duration } : {})
            }));
        }
        if (!items.length) {
            const links = await parse_html(html, 'a[href*="/vod/play/id/"]', 'href');
            for (const l of links) {
                if (items.length >= 24) break;
                const id = (l.attr || '').match(/\/id\/(\d+)/)?.[1];
                if (id) items.push(new MultimediaItem({ title: '视频 ' + id, url: id, posterUrl: '', type: 'movie' }));
            }
        }
        return items;
    }

    async function getPlayerJson(html) {
        const scripts = await parse_html(html, 'script', 'innerHTML');
        for (const s of scripts) {
            const body = s.innerHTML || '';
            const i = body.indexOf('player_aaaa=');
            if (i < 0) continue;
            const start = i + 'player_aaaa='.length;
            if (body[start] !== '{') continue;
            let depth = 0, end = -1;
            for (let j = start; j < body.length; j++) {
                if (body[j] === '{') depth++;
                else if (body[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
            }
            if (end < 0) continue;
            try { return JSON.parse(body.slice(start, end + 1)); } catch (_) {}
        }
        return null;
    }

    const decryptUrl = (encoded) => {
        try {
            return decodeURIComponent(decodeURIComponent(atob(encoded)));
        } catch (_) { return ''; }
    };

    function buildStreams(player) {
        if (!player || !player.url) return [];
        const raw = player.encrypt === 2 ? decryptUrl(player.url) : player.url;
        if (!raw) return [];
        const isHls = /\.m3u8/i.test(raw);
        return [new StreamResult({ url: raw, quality: isHls ? 'Auto' : '720p', headers: HEADERS })];
    }

    const EXTRACTOR_HOSTS = /mixdrop\.co|streamtape\.com|voe\.sx|filemoon|dood\.|hubcloud|rabbitstream|pixeldrain/i;

    async function resolveStreams(player) {
        const direct = buildStreams(player);
        if (direct.length) return direct;
        const ext = player?.url || '';
        if (ext && EXTRACTOR_HOSTS.test(ext) && typeof globalThis.loadExtractor === 'function') {
            const out = [];
            try {
                await globalThis.loadExtractor(ext, (s) => {
                    if (s && s.url) out.push(new StreamResult({
                        url: s.url,
                        quality: s.quality || 'Auto',
                        headers: s.headers || HEADERS,
                        ...(s.subtitles ? { subtitles: s.subtitles } : {})
                    }));
                });
                if (out.length) return out;
            } catch (_) {}
        }
        return [];
    }

    async function getHome(cb, page) {
        try {
            const sort = 'time_add';
            const pg = Math.max(1, parseInt(page, 10) || 1);
            const requests = CATEGORIES.map((c) => ({ url: catPageUrl(c.tid, sort, pg), headers: HEADERS }));
            let responses;
            try {
                responses = await http_parallel(requests);
            } catch (_) {
                responses = await Promise.all(requests.map((r) => http_get(r.url, r.headers).catch(() => null)));
            }
            const homes = await Promise.all(responses.map(async (res, i) => {
                if (!res || res.status !== 200) return null;
                const items = await parseList(String(res.body || ''));
                return items.length ? { name: CATEGORIES[i].name, items } : null;
            }));
            const home = {};
            homes.forEach((h) => { if (h) home[h.name] = h.items; });
            cb({ success: true, data: home });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e?.message || e) });
        }
    }

    async function search(query, cb, page) {
        try {
            const q = String(query || '').trim();
            if (!q) return cb({ success: true, data: [] });
            const pg = Math.max(1, parseInt(page, 10) || 1);
            const res = await http_get(searchUrl(q, 'time_add', pg), HEADERS);
            if (!res || res.status !== 200) return cb({ success: true, data: [] });
            cb({ success: true, data: await parseList(String(res.body || '')) });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e?.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            const id = extractId(url);
            if (!id) return cb({ success: false, errorCode: 'INVALID_ID' });

            const res = await http_get(playPageUrl(id), HEADERS);
            const html = String(res?.body || '');

            const ogPic = fixUrl(await meta(html, 'meta[property="og:image"]'));
            const pic = ogPic || await domPoster(html);
            const desc = await domText(html, 'h1');
            const year = await domYear(html);

            const player = await getPlayerJson(html);
            let vodName = '';
            let actress = '';
            if (player?.vod_data) {
                vodName = player.vod_data.vod_name || '';
                actress = player.vod_data.vod_actor || '';
            }
            const title = decodeEntities(vodName) || (await domText(html, 'h1')) || ('视频 ' + id);

            const cast = actress ? [new Actor({ name: actress })] : [];
            const streams = await resolveStreams(player);

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.slice(0, 120),
                    url: id,
                    posterUrl: pic,
                    type: 'movie',
                    ...(year ? { year } : {}),
                    ...(desc ? { description: desc } : {}),
                    ...(cast.length ? { cast } : {}),
                    episodes: [new Episode({
                        name: '正片',
                        url: id,
                        season: 1,
                        episode: 1,
                        ...(streams.length ? { streams } : {})
                    })]
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e?.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const id = extractId(url);
            if (!id) return cb({ success: true, data: [] });
            const res = await http_get(playPageUrl(id), HEADERS);
            const player = await getPlayerJson(String(res?.body || ''));
            cb({ success: true, data: await resolveStreams(player) });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e?.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
