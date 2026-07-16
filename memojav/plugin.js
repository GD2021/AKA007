(function () {

    var HOST = manifest.baseUrl || 'https://memojav.com';
    var ITEM_LIMIT = 24;
    var MAX_PAGE = 10;

    var CLASSES = [
        { type_id: 'best', type_name: '\u6700\u4F73' },
        { type_id: 'video', type_name: '\u6700\u65B0' },
        { type_id: 'categories/big-tits-lover', type_name: 'Big Tits Lover' },
        { type_id: 'categories/big-tits', type_name: 'Big Tits' },
        { type_id: 'categories/bodysuit', type_name: 'Bodysuit' },
        { type_id: 'categories/mature-woman', type_name: 'Mature Woman' },
        { type_id: 'categories/stepfamily', type_name: 'Stepfamily' },
        { type_id: 'categories/outdoor', type_name: 'Outdoor' },
        { type_id: 'categories/milf', type_name: 'MILF' },
        { type_id: 'categories/documentary', type_name: 'Documentary' },
    ];

    var CLASS_MAP = {};
    CLASSES.forEach(function (c) { CLASS_MAP[c.type_id] = c.type_name; });

    function cleanText(html) {
        if (!html) return '';
        var t = String(html).replace(/<[^>]+>/g, '');
        t = t.replace(/\s*\/\s*/g, ' ');
        return t.replace(/\s+/g, ' ').trim();
    }

    function formatPic(url) {
        if (!url) return '';
        if (url.indexOf('//') === 0) return 'https:' + url;
        if (url.indexOf('http') === 0) return url;
        return HOST + (url.indexOf('/') === 0 ? '' : '/') + url;
    }

    function isValidVideoId(vid) {
        return /^[A-Z]+-\d+[A-Z]?$/i.test(vid);
    }

    function buildCategoryUrl(typeId, page) {
        if (typeId === 'best') return page === 1 ? '/best/' : '/best/page-' + page;
        return page === 1 ? '/' + typeId + '/' : '/' + typeId + '/page-' + page;
    }

    function parseList(html) {
        if (!html) return [];
        var result = [];
        var seen = {};

        var itemRegex = /<a[^>]*class="[^"]*video-item[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var match;
        while ((match = itemRegex.exec(html)) !== null) {
            if (result.length >= ITEM_LIMIT) break;
            var href = match[1];
            var inner = match[2];
            var vidMatch = href.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i);
            if (!vidMatch) continue;
            var vodId = vidMatch[1].toUpperCase();
            if (seen[vodId]) continue;
            seen[vodId] = true;

            var imgEl = inner.match(/<img[^>]*(?:data-original|data-src|src)="([^"]+)"[^>]*>/i);
            var pic = imgEl ? formatPic(imgEl[1]) : '';

            var titleEl = inner.match(/<div[^>]*class="video-title"[^>]*>([\s\S]*?)<\/div>/i);
            var title = titleEl ? cleanText(titleEl[1]) : '';

            var metaEl = inner.match(/<div[^>]*class="video-metadata"[^>]*>([\s\S]*?)<\/div>/i);
            var meta = metaEl ? cleanText(metaEl[1]) : '';

            if (!meta) {
                var metaEl2 = inner.match(/<div[^>]*class="meta"[^>]*>([\s\S]*?)<\/div>/i);
                if (metaEl2) meta = cleanText(metaEl2[1]);
            }

            if (!title) {
                var titleAttr = href.match(/title="([^"]+)"/i);
                if (titleAttr) title = cleanText(titleAttr[1]);
            }

            result.push(new MultimediaItem({
                title: title || vodId,
                url: vodId,
                posterUrl: pic,
                type: 'movie',
                description: meta || undefined
            }));
        }

        if (result.length === 0) {
            var altRegex = /<a[^>]*href="([^"]*\/video\/([A-Z]+-\d+[A-Z]?)(?:\/|$)[^"]*)"[^>]*>/gi;
            while ((match = altRegex.exec(html)) !== null) {
                if (result.length >= ITEM_LIMIT) break;
                var vid = match[2].toUpperCase();
                if (seen[vid]) continue;
                seen[vid] = true;
                result.push(new MultimediaItem({
                    title: vid,
                    url: vid,
                    posterUrl: '',
                    type: 'movie'
                }));
            }
        }

        return result;
    }

    function parsePageCount(html) {
        var count = 1;
        var pages = html.match(/page-(\d+)/g) || [];
        for (var i = 0; i < pages.length; i++) {
            var n = parseInt(pages[i].replace('page-', ''), 10);
            if (n > count) count = n;
        }
        return count;
    }

    async function fetchPage(url) {
        var res = await http_get(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': HOST + '/'
        }, 15000);
        return String(res.body || '');
    }

    async function getHome(cb) {
        try {
            var sections = {};
            sections['Trending'] = [];

            try {
                var bestHtml = await fetchPage(HOST + '/best/');
                var bestItems = parseList(bestHtml);
                if (bestItems.length) {
                    sections['\u6700\u4F73'] = bestItems;
                    sections['Trending'] = bestItems.slice(0, 8);
                }
            } catch (_) {}

            try {
                var videoHtml = await fetchPage(HOST + '/video/');
                var videoItems = parseList(videoHtml);
                if (videoItems.length) sections['\u6700\u65B0'] = videoItems;
            } catch (_) {}

            cb({ success: true, data: sections });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        cb({ success: true, data: [] });
    }

    async function load(url, cb) {
        try {
            var vid = String(url || '').toUpperCase().trim();
            if (!vid || !isValidVideoId(vid)) {
                return cb({ success: false, errorCode: 'INVALID_ID', message: 'Invalid video ID: ' + vid });
            }

            var html = await fetchPage(HOST + '/video/' + vid);
            if (!html) {
                return cb({ success: false, errorCode: 'NOT_FOUND', message: 'Detail page not found' });
            }

            var titleMatch = html.match(/<h1[^>]*id="title"[^>]*>([\s\S]*?)<\/h1>/i);
            var vodName = vid;
            if (titleMatch) {
                vodName = cleanText(titleMatch[1].replace(/\s*\|.+$/, ''));
            }

            var picMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*\/?>/i);
            var vodPic = picMatch ? formatPic(picMatch[1]) : '';

            var descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"[^>]*\/?>/i);
            var vodContent = descMatch ? descMatch[1] : '';

            var actressName = '';
            var vodDirector = '';
            var vodYear = '';
            var studioName = '';

            var tableRegex = /<tr>[\s\S]*?<th>([\s\S]*?)<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
            var tMatch;
            while ((tMatch = tableRegex.exec(html)) !== null) {
                var th = cleanText(tMatch[1]);
                var td = tMatch[2];
                if (th.indexOf('Actress') === 0) {
                    var am = td.match(/<div[^>]*class="description-vertical"[^>]*>([\s\S]*?)<\/div>/i);
                    actressName = am ? cleanText(am[1]) : cleanText(td);
                } else if (th.indexOf('Director') === 0) {
                    vodDirector = cleanText(td);
                } else if (th.indexOf('Release Date') === 0) {
                    var ym = td.match(/(\d{4})/);
                    if (ym) vodYear = ym[1];
                } else if (th.indexOf('Studio') === 0) {
                    var sm = td.match(/<div[^>]*class="description-vertical"[^>]*>([\s\S]*?)<\/div>/i);
                    studioName = sm ? cleanText(sm[1]) : cleanText(td);
                }
            }

            var remarks = vid;
            if (studioName) remarks += ' \u2022 ' + studioName;
            if (actressName) remarks += ' \u2022 ' + actressName;

            var m3u8Url = 'https://video10.memojav.net/stream/' + vid + '/master.m3u8';

            var cast = [];
            if (actressName) {
                cast.push(new Actor({ name: actressName }));
            }

            var episodes = [new Episode({
                name: '\u6B63\u7247',
                url: m3u8Url,
                season: 1,
                episode: 1
            })];

            cb({
                success: true,
                data: new MultimediaItem({
                    title: vodName.substring(0, 120),
                    url: vid,
                    posterUrl: vodPic,
                    backgroundPosterUrl: vodPic || undefined,
                    description: vodContent || undefined,
                    type: 'movie',
                    year: vodYear ? parseInt(vodYear, 10) : undefined,
                    cast: cast.length ? cast : undefined,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            if (!url) return cb({ success: true, data: [] });

            if (/\.(m3u8|mp4|flv|mkv|ts)(\?|$)/i.test(url)) {
                cb({
                    success: true,
                    data: [new StreamResult({
                        url: url,
                        quality: '720p',
                        type: /\.m3u8/i.test(url) ? 'hls' : 'mp4',
                        headers: { 'Referer': HOST + '/' }
                    })]
                });
            } else {
                cb({ success: true, data: [] });
            }
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
