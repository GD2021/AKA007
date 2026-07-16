(function () {

    var BASE = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl) ? manifest.baseUrl : 'https://kanav.ad';
    var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    var HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' };

    var CATEGORIES = [
        { tid: '1',  name: '\u4E2D\u6587\u5B57\u5E55' },
        { tid: '2',  name: '\u65E5\u97E9\u6709\u7801' },
        { tid: '3',  name: '\u65E5\u97E9\u65E0\u7801' },
        { tid: '4',  name: '\u56FD\u4EA7AV' },
        { tid: '22', name: '\u6D41\u51FA\u81EA\u62CD' },
        { tid: '20', name: '\u52A8\u6F2B\u756A\u5267' },
        { tid: '\u7B2C\u4E00\u89C6\u89D2', name: '\u7B2C\u4E00\u89C6\u89D2' },
        { tid: '\u773C\u955C', name: '\u773C\u955C' },
        { tid: '\u5DE8\u5C4C', name: '\u5DE8\u5C4C' },
        { tid: '\u6210\u719F\u7684\u5973\u4EBA', name: '\u6210\u719F\u7684\u5973\u4EBA' },
        { tid: '\u5A46\u5A46', name: '\u5A46\u5A46' },
        { tid: '\u5973\u4E0A\u53F8', name: '\u5973\u4E0A\u53F8' },
        { tid: '\u5C3B\u7A74', name: '\u5C3B\u7A74' },
        { tid: '\u5973\u4F18', name: '\u5973\u4F18' },
        { tid: '\u5DE8\u4E73', name: '\u5DE8\u4E73' },
        { tid: '\u7EAA\u5F55\u7247', name: '\u7EAA\u5F55\u7247' },
    ];

    var KEYWORD_TIDS = {};
    for (var ci = 0; ci < CATEGORIES.length; ci++) {
        if (isNaN(Number(CATEGORIES[ci].tid))) KEYWORD_TIDS[CATEGORIES[ci].tid] = true;
    }

    function text(html) {
        return (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, function (_, c) { return String.fromCharCode(c); }).replace(/\s+/g, ' ').trim();
    }

    function fixUrl(u) {
        if (!u) return '';
        if (u.indexOf('//') === 0) return 'https:' + u;
        if (u.indexOf('http') === 0) return u;
        return u;
    }

    function isKeywordType(tid) { return !!KEYWORD_TIDS[tid]; }

    function catPageUrl(tid, sort, page) {
        if (isKeywordType(tid)) return BASE + '/index.php/vod/search/by/' + sort + '/page/' + page + '/wd/' + encodeURIComponent(tid) + '.html';
        return BASE + '/index.php/vod/show/by/' + sort + '/id/' + tid + '/page/' + page + '.html';
    }

    function searchUrl(keyword, sort, page) {
        return BASE + '/index.php/vod/search/by/' + sort + '/page/' + page + '/wd/' + encodeURIComponent(keyword) + '.html';
    }

    function playPageUrl(id) {
        return BASE + '/index.php/vod/play/id/' + id + '/sid/1/nid/1.html';
    }

    function parseList(html) {
        var items = [];
        var regex = /<div\s+class="col-md-3\s+col-sm-6\s+col-xs-6"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g;
        var m;
        while ((m = regex.exec(html)) !== null && items.length < 24) {
            var block = m[0];
            var linkMatch = block.match(/href="(\/index\.php\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/\d+\.html)"/);
            if (!linkMatch) continue;
            var id = linkMatch[2];
            var picMatch = block.match(/<img\s+[^>]*data-original="([^"]+)"/) || block.match(/<img\s+[^>]*src="([^"]+)"/);
            var pic = picMatch ? fixUrl(picMatch[1]) : '';
            var altMatch = block.match(/<img\s+[^>]*alt="([^"]+)"/);
            var titleMatch = block.match(/href="[^"]+"\s+title="([^"]+)"/);
            var title = altMatch ? text(altMatch[1]) : (titleMatch ? titleMatch[1] : '');
            var remarkMatch = block.match(/<span\s+class="model-view"[^>]*>([\s\S]*?)<\/span>/);
            var desc = remarkMatch ? text(remarkMatch[1]) : '';
            items.push(new MultimediaItem({
                title: title || '\u89C6\u9891 ' + id,
                url: id,
                posterUrl: pic,
                type: 'movie',
                description: desc || undefined
            }));
        }
        if (items.length === 0) {
            var altRegex = /href="(\/index\.php\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/\d+\.html)"/g;
            while ((m = altRegex.exec(html)) !== null && items.length < 24) {
                var fid = m[2];
                items.push(new MultimediaItem({ title: '\u89C6\u9891 ' + fid, url: fid, posterUrl: '', type: 'movie' }));
            }
        }
        return items;
    }

    function extractPlayerJson(html) {
        var start = html.indexOf('player_aaaa=');
        if (start < 0) return null;
        var jsonStart = start + 'player_aaaa='.length;
        if (jsonStart >= html.length || html[jsonStart] !== '{') return null;
        var braceCount = 0;
        for (var i = jsonStart; i < html.length; i++) {
            if (html[i] === '{') braceCount++;
            else if (html[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    try { return JSON.parse(html.substring(jsonStart, i + 1)); } catch (_) { return null; }
                }
            }
        }
        return null;
    }

    function decryptUrl(encoded) {
        try {
            var step1 = atob(encoded);
            var step2 = decodeURIComponent(step1);
            var step3 = decodeURIComponent(step2);
            return step3;
        } catch (_) { return ''; }
    }

    async function getHome(cb) {
        try {
            var home = {};
            var sort = 'time_add';
            await Promise.all(CATEGORIES.map(async function (cat) {
                try {
                    var res = await http_get(catPageUrl(cat.tid, sort, 1), HEADERS);
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
            var sort = 'time_add';
            var res = await http_get(searchUrl(q, sort, 1), HEADERS);
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

            var html = String((await http_get(playPageUrl(id), HEADERS)).body || '');
            var title = text(html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/)?.[1] || '')
                     || text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')
                     || '\u89C6\u9891 ' + id;

            var pic = fixUrl(html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)?.[1] || '');

            var player = extractPlayerJson(html);
            var actressName = '';
            var director = '';
            var vodName = title;
            if (player && player.vod_data) {
                vodName = player.vod_data.vod_name || title;
                actressName = player.vod_data.vod_actor || '';
                director = player.vod_data.vod_director || '';
            }

            var classText = '';
            var detailMatch = html.match(/class="stui-pannel__detail[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
                          || html.match(/class="detail-info"[^>]*>([\s\S]*?)<\/div>/i);
            if (detailMatch) classText = text(detailMatch[1]);
            var keywords = text(html.match(/<meta\s+name="keywords"\s+content="([^"]+)"/)?.[1] || '');

            var cast = actressName ? [new Actor({ name: actressName })] : [];

            cb({
                success: true,
                data: new MultimediaItem({
                    title: vodName.substring(0, 120),
                    url: id,
                    posterUrl: pic,
                    backgroundPosterUrl: pic || undefined,
                    description: classText || keywords || undefined,
                    type: 'movie',
                    cast: cast.length ? cast : undefined,
                    director: director || undefined,
                    episodes: [new Episode({
                        name: '\u6B63\u7247',
                        url: id,
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
            var id = String(url || '').trim();
            if (!id || !/^\d+$/.test(id)) return cb({ success: true, data: [] });

            var html = String((await http_get(playPageUrl(id), HEADERS)).body || '');
            var player = extractPlayerJson(html);
            var streams = [];

            if (player && player.url) {
                var raw = (player.encrypt === 2) ? decryptUrl(player.url) : player.url;
                if (raw) {
                    if (/\.m3u8(?:\?|$)/i.test(raw)) {
                        streams.push(new StreamResult({ url: raw, quality: '720p', type: 'hls', headers: HEADERS }));
                    } else if (/\.(mp4|flv|mkv|ts)(\?|$|#)/i.test(raw)) {
                        streams.push(new StreamResult({ url: raw, quality: '720p', type: 'mp4', headers: HEADERS }));
                    }
                }
            }

            if (!streams.length) {
                streams.push(new StreamResult({ url: playPageUrl(id), quality: '720p', type: 'hls', headers: HEADERS }));
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
