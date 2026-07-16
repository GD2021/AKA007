(function () {

    var BASE = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl) ? manifest.baseUrl : 'https://hsex.tv';
    var UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
    var HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/' };

    var STATIC_CATS = [
        { tid: 'list',       name: '\u6700\u65B0\u89C6\u9891' },
        { tid: 'top7_list',  name: '\u5468\u699C\u70ED\u95E8' },
        { tid: 'top_list',   name: '\u6708\u699C\u70ED\u95E8' },
        { tid: '5min_list',  name: '5\u5206\u949F+' },
        { tid: 'long_list',  name: '10\u5206\u949F+' },
    ];

    var SEARCH_CATS = [
        { keyword: '\u719F\u5973', name: '\u719F\u5973' },
        { keyword: '\u8DB3\u7597', name: '\u8DB3\u7597' },
    ];

    var ALL_CATS = STATIC_CATS.concat(SEARCH_CATS);

    var RE_M3U8 = /(https:\/\/(?:cdn|cdn1|shark)\.hdcdn\.online\/[^\s"'<>]+\/hls\/[^\/]+\/index\.m3u8)/;

    function fixUrl(u) {
        if (!u) return '';
        if (u.indexOf('//') === 0) return 'https:' + u;
        if (u.indexOf('http') === 0) return u;
        return BASE + (u.indexOf('/') === 0 ? '' : '/') + u;
    }

    function text(el) { return el ? (el.textContent || el.innerText || '').trim() : ''; }

    function buildStaticUrl(tid, page) {
        return BASE + '/' + tid + '-' + page + '.htm';
    }

    function buildSearchUrl(keyword, page) {
        return BASE + '/search-' + page + '.htm?search=' + encodeURIComponent(keyword) + '&sort=new';
    }

    function detailUrl(id) { return BASE + '/video-' + id + '.htm'; }

    function parseList(html) {
        var items = [];
        var seen = {};
        var regex = /<div[^>]*class="[^"]*thumbnail[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
        var m;
        while ((m = regex.exec(html)) !== null && items.length < 24) {
            var block = m[1];
            var aMatch = block.match(/href="[^"]*video-(\d+)\.htm/i);
            if (!aMatch) continue;
            var id = aMatch[1];
            if (seen[id]) continue;
            seen[id] = true;

            var pic = '';
            var bgMatch = block.match(/style="[^"]*background:\s*url\(['"]?([^'")]+)['"]?\)/i);
            if (bgMatch) pic = fixUrl(bgMatch[1]);

            var title = '';
            var titleMatch = block.match(/<h5[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            var desc = '';
            var durMatch = block.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            if (durMatch) desc = durMatch[1].replace(/<[^>]+>/g, '').trim();

            items.push(new MultimediaItem({
                title: title || 'Video ' + id,
                url: id,
                posterUrl: pic,
                type: 'movie',
                description: desc || undefined
            }));
        }
        if (items.length === 0) {
            var altRegex = /href="[^"]*video-(\d+)\.htm/gi;
            while ((m = altRegex.exec(html)) !== null && items.length < 24) {
                var fid = m[1];
                if (seen[fid]) continue;
                seen[fid] = true;
                items.push(new MultimediaItem({ title: 'Video ' + fid, url: fid, posterUrl: '', type: 'movie' }));
            }
        }
        return items;
    }

    async function getHome(cb) {
        try {
            var home = {};
            await Promise.all(ALL_CATS.map(async function (cat) {
                try {
                    var url = cat.tid ? buildStaticUrl(cat.tid, 1) : buildSearchUrl(cat.keyword, 1);
                    var res = await http_get(url, HEADERS);
                    if (!res || res.status !== 200) return;
                    var items = parseList(String(res.body || ''));
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
            var url = buildSearchUrl(q, 1);
            var res = await http_get(url, HEADERS);
            if (!res || res.status !== 200) return cb({ success: true, data: [] });
            var items = parseList(String(res.body || ''));
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            var id = String(url || '').trim();
            if (!id || !/^\d+$/.test(id)) return cb({ success: false, errorCode: 'INVALID_ID' });

            var html = String((await http_get(detailUrl(id), HEADERS)).body || '');
            var doc = await parseHtml(html);

            var title = '';
            var ogTitle = doc.querySelector('meta[property="og:title"]');
            if (ogTitle) title = text(ogTitle);
            if (!title) {
                var titleTag = doc.querySelector('title');
                if (titleTag) title = (text(titleTag) || '').split('-')[0].trim();
            }
            if (!title) title = 'Video ' + id;

            var pic = '';
            var videoPoster = html.match(/<video[^>]+poster=["']([^"']+)["']/);
            if (videoPoster) pic = fixUrl(videoPoster[1]);
            if (!pic) {
                var imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|webp|png))[^"']*["'][^>]*\/?>/i);
                if (imgMatch) pic = fixUrl(imgMatch[1]);
            }
            if (!pic) {
                var ogImg = doc.querySelector('meta[property="og:image"]');
                if (ogImg) pic = fixUrl(ogImg.getAttribute('content') || '');
            }

            var m3u8Match = html.match(RE_M3U8);
            var streamUrl = m3u8Match ? m3u8Match[1] : id;

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.substring(0, 120),
                    url: id,
                    posterUrl: pic,
                    backgroundPosterUrl: pic || undefined,
                    type: 'movie',
                    episodes: [new Episode({
                        name: '\u6B63\u7247',
                        url: streamUrl,
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

            if (/\.(m3u8|mp4|flv|mkv|ts)(\?|$|#)/i.test(raw)) {
                return cb({
                    success: true,
                    data: [new StreamResult({
                        url: raw,
                        quality: '720p',
                        type: /\.m3u8/i.test(raw) ? 'hls' : 'mp4',
                        headers: HEADERS
                    })]
                });
            }

            if (/^\d+$/.test(raw)) {
                var html = String((await http_get(detailUrl(raw), HEADERS)).body || '');
                var m3u8 = html.match(RE_M3U8);
                if (m3u8) {
                    return cb({
                        success: true,
                        data: [new StreamResult({ url: m3u8[1], quality: '720p', type: 'hls', headers: HEADERS })]
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
