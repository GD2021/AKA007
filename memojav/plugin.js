(function () {

    var BASE = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl) ? manifest.baseUrl : 'https://memojav.com';
    var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0';
    var HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/' };

    var CATEGORIES = [
        { name: '\u6700\u4F73',          slug: 'best' },
        { name: '\u6700\u65B0',          slug: 'video' },
        { name: 'Big Tits Lover',        slug: 'categories/big-tits-lover' },
        { name: 'Big Tits',              slug: 'categories/big-tits' },
        { name: 'Bodysuit',              slug: 'categories/bodysuit' },
        { name: 'Mature Woman',          slug: 'categories/mature-woman' },
        { name: 'Stepfamily',            slug: 'categories/stepfamily' },
        { name: 'Outdoor',               slug: 'categories/outdoor' },
        { name: 'MILF',                  slug: 'categories/milf' },
        { name: 'Documentary',           slug: 'categories/documentary' },
    ];

    function text(el) { return el ? (el.textContent || el.innerText || '').trim() : ''; }

    function fixUrl(u) {
        if (!u) return '';
        if (u.indexOf('//') === 0) return 'https:' + u;
        if (u.indexOf('http') === 0) return u;
        return BASE + (u.indexOf('/') === 0 ? '' : '/') + u;
    }

    function catPageUrl(slug, page) {
        if (slug === 'best') return page === 1 ? BASE + '/best/' : BASE + '/best/page-' + page;
        return page === 1 ? BASE + '/' + slug + '/' : BASE + '/' + slug + '/page-' + page;
    }

    function parseItems(doc) {
        var items = [];
        var articles = doc.querySelectorAll('a.video-item');
        for (var i = 0; i < articles.length && items.length < 24; i++) {
            var a = articles[i];
            var href = a.getAttribute('href');
            if (!href) continue;
            var vid = (href.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i) || [])[1];
            if (!vid) continue;
            var title = text(a.querySelector('.video-title')) || vid;
            var img = a.querySelector('img');
            var poster = img ? fixUrl(img.getAttribute('src') || '') : '';
            var desc = text(a.querySelector('.video-metadata'));
            items.push(new MultimediaItem({
                title: title,
                url: BASE + '/video/' + vid,
                posterUrl: poster,
                type: 'movie',
                description: desc || undefined
            }));
        }
        if (items.length === 0) {
            for (var j = 0; j < articles.length && items.length < 24; j++) {
                var a2 = articles[j];
                var href2 = a2.getAttribute('href');
                if (!href2) continue;
                var vid2 = (href2.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i) || [])[1];
                if (!vid2) continue;
                items.push(new MultimediaItem({
                    title: vid2,
                    url: BASE + '/video/' + vid2,
                    posterUrl: '',
                    type: 'movie'
                }));
            }
        }
        return items;
    }

    async function getHome(cb) {
        try {
            var home = {};
            var allItems = [];
            await Promise.all(CATEGORIES.map(async function (cat) {
                try {
                    var pages = await Promise.all([1, 2, 3].map(async function (p) {
                        try {
                            var res = await http_get(catPageUrl(cat.slug, p), HEADERS);
                            if (!res || res.status !== 200) return [];
                            return parseItems(await parseHtml(res.body));
                        } catch (_) { return []; }
                    }));
                    var seen = {};
                    var merged = [];
                    for (var pi = 0; pi < pages.length; pi++) {
                        for (var pj = 0; pj < pages[pi].length; pj++) {
                            var item = pages[pi][pj];
                            if (!seen[item.url]) { seen[item.url] = true; merged.push(item); }
                        }
                    }
                    if (merged.length > 0) {
                        home[cat.name] = merged;
                        for (var m = 0; m < merged.length; m++) allItems.push(merged[m]);
                    }
                } catch (_) {}
            }));
            if (allItems.length > 0) {
                var shuffled = allItems.slice().sort(function () { return 0.5 - Math.random(); });
                home['Trending'] = shuffled.slice(0, 12);
            }
            cb({ success: true, data: home });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        cb({ success: true, data: [] });
    }

    async function load(url, cb) {
        try {
            if (!url) return cb({ success: false, errorCode: 'NO_URL' });
            var res = await http_get(url, HEADERS);
            if (!res || res.status !== 200) return cb({ success: false, errorCode: 'NOT_FOUND' });
            var doc = await parseHtml(res.body);

            var title = text(doc.querySelector('h1#title'));

            var poster = '';
            var ogImg = doc.querySelector('meta[property="og:image"]');
            if (ogImg) poster = fixUrl(ogImg.getAttribute('content') || '');

            var desc = text(doc.querySelector('p#title-description'));
            if (!desc) {
                var ogDesc = doc.querySelector('meta[property="og:description"]');
                if (ogDesc) desc = ogDesc.getAttribute('content') || '';
            }

            var year;
            var releaseBlock = doc.querySelector('div.details-block h2');
            if (releaseBlock && text(releaseBlock).indexOf('Release') !== -1) {
                var releaseP = releaseBlock.parentNode ? releaseBlock.parentNode.querySelector('p') : null;
                if (releaseP) {
                    var ym = text(releaseP).match(/(\d{4})/);
                    if (ym) year = parseInt(ym[1]);
                }
            }

            var actressName = '';
            var director = '';
            var studio = '';
            var rows = doc.querySelectorAll('table tr');
            for (var i = 0; i < rows.length; i++) {
                var th = rows[i].querySelector('th');
                var td = rows[i].querySelector('td');
                if (!th || !td) continue;
                var label = text(th);
                var val = text(td);
                if (label === 'Actress:') {
                    actressName = text(td.querySelector('span.description-vertical')) || val;
                } else if (label === 'Director:') {
                    director = val;
                } else if (label === 'Studio:') {
                    studio = text(td.querySelector('span.description-vertical')) || val;
                }
            }

            var cast = actressName ? [new Actor({ name: actressName })] : [];

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.substring(0, 120) || url,
                    url: url,
                    posterUrl: poster,
                    backgroundPosterUrl: poster || undefined,
                    description: desc || undefined,
                    type: 'movie',
                    year: year,
                    cast: cast.length ? cast : undefined,
                    director: director || undefined,
                    studio: studio || undefined,
                    episodes: [new Episode({
                        name: '\u6B63\u7247',
                        url: url,
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
            if (!url) return cb({ success: true, data: [] });
            var vid = (url.match(/\/video\/([A-Z]+-\d+[A-Z]?)/i) || [])[1];
            if (!vid) return cb({ success: true, data: [] });

            var streams = [];

            var m3u8Direct = 'https://video10.memojav.net/stream/' + vid + '/master.m3u8';
            streams.push(new StreamResult({ url: m3u8Direct, quality: '720p', type: 'hls', headers: HEADERS }));

            try {
                var t = new Date().getTime();
                var sig = btoa(String(t));
                var s = sig.length - 12;
                sig = sig.substr(s, 10);
                var sts = 1;
                for (var i = 0; i < 10; i++) sts += sig.charCodeAt(i) * i * 1743;

                var apiUrl = BASE + '/hls/get_video_info.php?id=' + encodeURIComponent(vid) + '&sig=' + sig + '&sts=' + sts;
                var res = await http_get(apiUrl, HEADERS);
                var body = String(res && res.body || '');
                var jsonStr = body.split('for (;;);')[1] || body;
                var data;
                try { data = JSON.parse(jsonStr); } catch (_) { data = null; }

                if (data && data.success && data.url) {
                    var streamUrl = decodeURIComponent(data.url);
                    if (data.type === 'hls' || /\.m3u8/i.test(streamUrl)) {
                        streams.push(new StreamResult({ url: streamUrl, quality: '1080p', type: 'hls', headers: HEADERS }));
                    } else {
                        streams.push(new StreamResult({ url: streamUrl + '=m22', quality: '720p', type: 'mp4', headers: HEADERS }));
                        streams.push(new StreamResult({ url: streamUrl + '=m37', quality: '1080p', type: 'mp4', headers: HEADERS }));
                    }
                }
            } catch (_) {}

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
