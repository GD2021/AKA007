(function () {

    var BASE = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl) ? manifest.baseUrl : 'https://91pinse.com';
    var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    var HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' };

    var CATEGORIES = [
        { id: 'weekly-hot', name: '\u6BCF\u5468\u70ED\u95E8', url: '/rank/weekly-hot' },
        { id: 'month-hot',  name: '\u6BCF\u6708\u70ED\u95E8', url: '/rank/month-hot' },
        { id: '\u719F\u5973',   name: '\u719F\u5973' },
        { id: '\u963F\u59E8',   name: '\u963F\u59E8' },
        { id: '\u5DE8\u4E73',   name: '\u5DE8\u4E73' },
        { id: '\u5927\u5976',   name: '\u5927\u5976' },
        { id: '\u5C11\u5987',   name: '\u5C11\u5987' },
        { id: '\u773C\u955C',   name: '\u773C\u955C' },
        { id: '\u53E3\u7206',   name: '\u53E3\u7206' },
        { id: '\u9732\u8138',   name: '\u9732\u8138' },
        { id: '\u8001\u963F\u59E8', name: '\u8001\u963F\u59E8' },
        { id: '\u6280\u5E08',   name: '\u6280\u5E08' },
        { id: '\u6253\u70AE',   name: '\u6253\u70AE' },
        { id: '\u4F53\u80B2\u751F', name: '\u4F53\u80B2\u751F' },
    ];

    var KEYWORD_CATS = {};
    for (var ci = 0; ci < CATEGORIES.length; ci++) {
        if (!CATEGORIES[ci].url) KEYWORD_CATS[CATEGORIES[ci].id] = true;
    }

    function text(html) {
        return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    function fixUrl(u, base) {
        if (!u) return '';
        if (u.indexOf('//') === 0) return 'https:' + u;
        if (u.indexOf('http') === 0) return u;
        return (base || BASE) + (u.indexOf('/') === 0 ? '' : '/') + u;
    }

    function isKeyword(catId) { return !!KEYWORD_CATS[catId]; }

    function catPageUrl(cat, page) {
        if (cat.url) return page <= 1 ? BASE + cat.url : BASE + cat.url + '?page=' + page;
        var qs = 'keyword=' + encodeURIComponent(cat.id) + '&page=' + page;
        return BASE + '/v/search?' + qs;
    }

    function searchUrl(keyword, page) {
        return BASE + '/v/search?keyword=' + encodeURIComponent(keyword) + '&page=' + page;
    }

    function detailUrl(id) { return BASE + '/v/' + id; }

    function extractM3u8(html) {
        var m = html.match(/var\s+_[a-z0-9]+\s*=\s*'([^']+)'/);
        if (!m) return '';
        try {
            var raw = m[1]
                .replace(/\\u003D/g, '=')
                .replace(/\\u0026/g, '&')
                .replace(/\\u003F/g, '?')
                .replace(/\\u003A/g, ':')
                .replace(/\\u002F/g, '/');
            var decoded = atob(raw);
            if (/^https?:\/\/.+\.m3u8(\?.*)?$/i.test(decoded)) return decoded;
        } catch (_) {}
        return '';
    }

    function parseList(html, refUrl) {
        var items = [];
        var seen = {};
        var regex = /<article[^>]*class="[^"]*video-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
        var m;
        while ((m = regex.exec(html)) !== null && items.length < 24) {
            var block = m[1];
            var aMatch = block.match(/href="(\/v\/(\d+))"/);
            if (!aMatch) continue;
            var id = aMatch[2];
            if (id.length < 5 || seen[id]) continue;
            seen[id] = true;

            var title = '';
            var imgAlt = block.match(/<img[^>]*alt="([^"]+)"/);
            if (imgAlt) title = text(imgAlt[1]);
            if (!title) {
                var titleAttr = block.match(/class="[^"]*video-card-title[^"]*"[^>]*title="([^"]+)"/);
                if (titleAttr) title = titleAttr[1];
            }

            var pic = '';
            var imgSrc = block.match(/<img[^>]*src="([^"]+)"/) || block.match(/<img[^>]*data-original="([^"]+)"/);
            if (imgSrc) pic = fixUrl(imgSrc[1], refUrl);

            var desc = '';
            var durSpan = block.match(/<span[^>]*class="[^"]*video-duration[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            if (durSpan) desc = text(durSpan[1]);

            var author = '';
            var authorA = block.match(/<a[^>]*class="[^"]*video-card-author[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
            if (authorA) author = text(authorA[1]);

            items.push(new MultimediaItem({
                title: title || 'Video ' + id,
                url: id,
                posterUrl: pic,
                type: 'movie',
                description: desc || author || undefined
            }));
        }
        if (items.length === 0) {
            var altRegex = /href="\/v\/(\d+)"/g;
            while ((m = altRegex.exec(html)) !== null && items.length < 24) {
                var fid = m[1];
                if (fid.length < 5 || seen[fid]) continue;
                seen[fid] = true;
                items.push(new MultimediaItem({ title: 'Video ' + fid, url: fid, posterUrl: '', type: 'movie' }));
            }
        }
        return items;
    }

    async function getHome(cb) {
        try {
            var home = {};
            await Promise.all(CATEGORIES.map(async function (cat) {
                try {
                    var url = catPageUrl(cat, 1);
                    var res = await http_get(url, HEADERS);
                    if (!res || res.status !== 200) return;
                    var items = parseList(String(res.body || ''), url);
                    if (items.length > 0) home[cat.name] = items;
                } catch (_) {}
            }));
            cb({ success: true, data: home });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            var q = String(query || '').trim();
            if (!q) return cb({ success: true, data: [] });
            var url = searchUrl(q, 1);
            var res = await http_get(url, HEADERS);
            if (!res || res.status !== 200) return cb({ success: true, data: [] });
            var items = parseList(String(res.body || ''), url);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            var id = String(url || '').trim();
            if (!id || !/^\d+$/.test(id)) return cb({ success: false, errorCode: 'INVALID_ID' });

            var detailUrl_ = detailUrl(id);
            var res = await http_get(detailUrl_, HEADERS);
            if (!res || res.status !== 200) return cb({ success: false, errorCode: 'NOT_FOUND' });
            var html = String(res.body || '');
            var doc = await parseHtml(html);

            var title = '';
            var ogTitle = doc.querySelector('meta[property="og:title"]');
            if (ogTitle) title = text(ogTitle.getAttribute('content') || '');
            if (!title) {
                var h1 = doc.querySelector('h1');
                if (h1) title = text(h1.textContent || h1.innerText || '');
            }
            title = title.replace(/\s*-\s*91PinSe\s*$/, '').trim();
            if (!title) title = 'Video ' + id;

            var pic = '';
            var ogImg = doc.querySelector('meta[property="og_image"]') || doc.querySelector('meta[property="og:image"]');
            if (ogImg) pic = fixUrl(ogImg.getAttribute('content') || '', detailUrl_);

            var author = '';
            var authorMatch = html.match(/href\s*=\s*["']\/v\/author\/["'][^>]*>([^<]+)<\/a>/);
            if (authorMatch) author = text(authorMatch[1]);

            var m3u8Url = extractM3u8(html);

            var cast = author ? [new Actor({ name: author })] : [];

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.substring(0, 120),
                    url: id,
                    posterUrl: pic,
                    backgroundPosterUrl: pic || undefined,
                    description: author || undefined,
                    type: 'movie',
                    cast: cast.length ? cast : undefined,
                    episodes: [new Episode({
                        name: '\u6B63\u7247',
                        url: m3u8Url || id,
                        season: 1,
                        episode: 1
                    })]
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            var raw = String(url || '').trim();
            if (!raw) return cb({ success: true, data: [] });

            if (/\.m3u8(?:\?|$)/i.test(raw)) {
                return cb({
                    success: true,
                    data: [new StreamResult({ url: raw, quality: '720p', type: 'hls', headers: HEADERS })]
                });
            }

            if (/^\d+$/.test(raw)) {
                var html = String((await http_get(detailUrl(raw), HEADERS)).body || '');
                var m3u8Url = extractM3u8(html);
                if (m3u8Url) {
                    return cb({
                        success: true,
                        data: [new StreamResult({ url: m3u8Url, quality: '720p', type: 'hls', headers: HEADERS })]
                    });
                }
            }

            cb({ success: true, data: [] });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
