(function () {

    function getHost() {
        try { return manifest.baseUrl || 'https://memojav.com'; } catch (_) { return 'https://memojav.com'; }
    }

    var CATEGORIES = [
        { id: 'best', name: '\u6700\u4F73' },
        { id: 'video', name: '\u6700\u65B0' },
        { id: 'categories/big-tits-lover', name: 'Big Tits Lover' },
        { id: 'categories/big-tits', name: 'Big Tits' },
        { id: 'categories/bodysuit', name: 'Bodysuit' },
        { id: 'categories/mature-woman', name: 'Mature Woman' },
        { id: 'categories/stepfamily', name: 'Stepfamily' },
        { id: 'categories/outdoor', name: 'Outdoor' },
        { id: 'categories/milf', name: 'MILF' },
        { id: 'categories/documentary', name: 'Documentary' },
    ];

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
        return getHost() + (url.indexOf('/') === 0 ? '' : '/') + url;
    }

    function isValidVideoId(vid) {
        return /^[A-Z]+-\d+[A-Z]?$/i.test(vid);
    }

    function generateSig() {
        var t = new Date().getTime();
        var sig = btoa(String(t));
        var s = sig.length - 12;
        sig = sig.substr(s, 10);
        var sts = 1;
        for (var i = 0; i < 10; i++) {
            sts += sig.charCodeAt(i) * i * 1743;
        }
        return { sig: sig, sts: sts };
    }

    function buildUrl(typeId, page) {
        if (typeId === 'best') return page === 1 ? '/best/' : '/best/page-' + page;
        return page === 1 ? '/' + typeId + '/' : '/' + typeId + '/page-' + page;
    }

    function parseList(html, limit) {
        if (!html) return [];
        var result = [];
        var seen = {};
        var maxItems = limit || 24;

        var itemRegex = /<a[^>]*href="([^"]+)"[^>]*class="[^"]*video-item[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        var match;
        while ((match = itemRegex.exec(html)) !== null) {
            if (result.length >= maxItems) break;
            var href = match[1];
            var inner = match[2];
            var vidMatch = href.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i);
            if (!vidMatch) continue;
            var vodId = vidMatch[1].toUpperCase();
            if (seen[vodId]) continue;
            seen[vodId] = true;

            var imgEl = inner.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
            var pic = imgEl ? formatPic(imgEl[1]) : '';

            var titleEl = inner.match(/<div[^>]*class="[^"]*video-title[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            var title = titleEl ? cleanText(titleEl[1]) : '';

            var metaEl = inner.match(/<div[^>]*class="video-metadata"[^>]*>([\s\S]*?)<\/div>/i);
            var meta = metaEl ? cleanText(metaEl[1]) : '';

            result.push(new MultimediaItem({
                title: title || vodId,
                url: vodId,
                posterUrl: pic,
                type: 'movie',
                description: meta || undefined
            }));
        }

        if (result.length === 0) {
            var altRegex = /<a[^>]*href="([^"]*\/video\/([A-Z]+-\d+[A-Z]?)(?:\/|$)[^"]*)"[^>]*class="[^"]*video-item[^"]*"[^>]*>/gi;
            while ((match = altRegex.exec(html)) !== null) {
                if (result.length >= maxItems) break;
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

    async function fetchPage(url) {
        var res = await http_get(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': getHost() + '/'
        }, 15000);
        return String(res.body || '');
    }

    async function fetchCategoryItems(cat) {
        var pageItems = await Promise.all([1, 2, 3].map(async function (p) {
            try {
                var url = getHost() + buildUrl(cat.id, p);
                var html = await fetchPage(url);
                return parseList(html, 24);
            } catch (_) {
                return [];
            }
        }));
        var seen = {};
        var merged = [];
        for (var i = 0; i < pageItems.length && merged.length < 60; i++) {
            for (var j = 0; j < pageItems[i].length && merged.length < 60; j++) {
                var item = pageItems[i][j];
                if (!seen[item.url]) {
                    seen[item.url] = true;
                    merged.push(item);
                }
            }
        }
        return merged;
    }

    async function fetchVideoInfo(videoId) {
        var sigData = generateSig();
        var url = getHost() + '/hls/get_video_info.php?id=' + encodeURIComponent(videoId) + '&sig=' + sigData.sig + '&sts=' + sigData.sts;
        var res = await http_get(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': getHost() + '/'
        }, 15000);
        var body = String(res.body || '');
        var jsonStr = body.split('for (;;);')[1] || body;
        var data;
        try { data = JSON.parse(jsonStr); } catch (_) { return null; }
        if (data && data.success && data.url) {
            return {
                url: decodeURIComponent(data.url),
                type: data.type || 'mp4'
            };
        }
        return null;
    }

    async function getHome(cb) {
        try {
            var sections = {};

            var results = await Promise.all(CATEGORIES.map(async function (cat) {
                var items = await fetchCategoryItems(cat);
                return { name: cat.name, items: items };
            }));

            var trending = [];
            results.forEach(function (r) {
                if (r.items.length) {
                    sections[r.name] = r.items;
                    if (trending.length < 12) {
                        trending = trending.concat(r.items.slice(0, 4));
                    }
                }
            });

            if (trending.length) {
                sections['Trending'] = trending.slice(0, 12);
            }

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

            var html = await fetchPage(getHost() + '/video/' + vid);
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

            var descMeta = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"[^>]*\/?>/i);
            var descEl = html.match(/<p[^>]*id="title-description"[^>]*>([\s\S]*?)<\/p>/i);
            var vodContent = descEl ? cleanText(descEl[1]) : (descMeta ? descMeta[1] : '');

            var actressName = '';
            var vodDirector = '';
            var vodYear = '';
            var studioName = '';

            var releaseDateMatch = html.match(/<div class="details-block">\s*<h2[^>]*>Release Date<\/h2>\s*<p[^>]*>([^<]+)<\/p>/i);
            if (releaseDateMatch) {
                var ym = releaseDateMatch[1].match(/(\d{4})/);
                if (ym) vodYear = ym[1];
            }

            var tableRegex = /<tr>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
            var tMatch;
            while ((tMatch = tableRegex.exec(html)) !== null) {
                var th = cleanText(tMatch[1]);
                var td = tMatch[2];
                if (th === 'Actress:') {
                    var am = td.match(/<span[^>]*class="description-vertical[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
                    actressName = am ? cleanText(am[1]) : cleanText(td);
                } else if (th === 'Director:') {
                    vodDirector = cleanText(td);
                } else if (th === 'Studio:') {
                    var sm = td.match(/<span[^>]*class="description-vertical[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
                    studioName = sm ? cleanText(sm[1]) : cleanText(td);
                }
            }

            var cast = [];
            if (actressName) cast.push(new Actor({ name: actressName }));

            var episodes = [new Episode({
                name: '\u6B63\u7247',
                url: vid,
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
                    director: vodDirector || undefined,
                    studio: studioName || undefined,
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

            var videoId = String(url || '').toUpperCase().trim();
            var streams = [];

            if (isValidVideoId(videoId)) {
                var videoInfo = await fetchVideoInfo(videoId);
                if (videoInfo && videoInfo.url) {
                    if (videoInfo.type === 'hls' || /\.m3u8/i.test(videoInfo.url)) {
                        streams.push(new StreamResult({
                            url: videoInfo.url,
                            quality: '720p',
                            type: 'hls',
                            headers: { 'Referer': getHost() + '/', 'User-Agent': 'Mozilla/5.0' }
                        }));
                    } else {
                        streams.push(new StreamResult({
                            url: videoInfo.url + '=m22',
                            quality: '720p',
                            type: 'mp4',
                            headers: { 'Referer': getHost() + '/', 'User-Agent': 'Mozilla/5.0' }
                        }));
                        streams.push(new StreamResult({
                            url: videoInfo.url + '=m37',
                            quality: '1080p',
                            type: 'mp4',
                            headers: { 'Referer': getHost() + '/', 'User-Agent': 'Mozilla/5.0' }
                        }));
                    }
                }
            }

            var m3u8Fallback = 'https://video10.memojav.net/stream/' + videoId + '/master.m3u8';
            if (!streams.length && /\.(m3u8|mp4|flv|mkv|ts)(\?|$)/i.test(url)) {
                streams.push(new StreamResult({
                    url: url,
                    quality: '720p',
                    type: /\.m3u8/i.test(url) ? 'hls' : 'mp4',
                    headers: { 'Referer': getHost() + '/', 'User-Agent': 'Mozilla/5.0' }
                }));
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
