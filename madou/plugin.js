const API_HOST = 'https://91md.me';
const API_URL = 'https://91md.me/api.php/provide/vod';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': API_HOST + '/',
};
const ITEM_LIMIT = 20;

function formatVideos(list) {
    if (!Array.isArray(list)) return [];
    return list.map(v => {
        if (!v) return null;
        return {
            url: String(v.vod_id || ''),
            name: String(v.vod_name || ''),
            image: String(v.vod_pic || ''),
            info: String(v.vod_remarks || ''),
        };
    }).filter(Boolean);
}

function parseEpisodes(vodItem) {
    const playUrl = vodItem.vod_play_url || '';
    if (!playUrl) return [{ name: '正片', url: '' }];
    return playUrl.split('#').map((item, index) => {
        const parts = item.split('$');
        return {
            name: parts[0] || '\u7B2C' + (index + 1) + '\u96C6',
            url: parts[1] || '',
        };
    }).filter(ep => ep.url);
}

async function getHome() {
    try {
        const res = await http_get(API_URL + '?ac=list&pg=1&pagesize=' + ITEM_LIMIT, HEADERS);
        const data = JSON.parse(res);
        const classes = (data.class || []).map(c => ({
            type_id: String(c.type_id),
            type_name: c.type_name,
        }));
        return {
            categories: classes,
            items: formatVideos(data.list || []),
        };
    } catch (e) {
        return { categories: [], items: [] };
    }
}

async function searchLoad(params) {
    try {
        const wd = params.keyword || params.wd || '';
        const page = parseInt(params.page || 1);
        if (!wd) return { items: [] };

        const res = await http_get(API_URL + '?ac=list&wd=' + encodeURIComponent(wd) + '&pg=' + page + '&pagesize=' + ITEM_LIMIT, HEADERS);
        const data = JSON.parse(res);
        const totalPages = data.pagecount || 1;

        return {
            items: formatVideos(data.list || []),
            nextPage: page < totalPages ? page + 1 : undefined,
        };
    } catch (e) {
        return { items: [] };
    }
}

async function load(url) {
    try {
        const res = await http_get(API_URL + '?ac=videolist&ids=' + encodeURIComponent(url), HEADERS);
        const data = JSON.parse(res);
        const item = (data.list || [])[0];
        if (!item) return { name: '', image: '', info: '', episodes: [] };

        const episodes = parseEpisodes(item);

        return {
            name: String(item.vod_name || ''),
            image: String(item.vod_pic || ''),
            info: String(item.vod_content || item.vod_name || ''),
            episodes: episodes,
        };
    } catch (e) {
        return { name: '', image: '', info: '', episodes: [] };
    }
}

async function loadStreams(episodeUrl) {
    return {
        urls: [{ name: '\u64AD\u653E', url: episodeUrl }],
        headers: {
            'User-Agent': HEADERS['User-Agent'],
            'Referer': API_HOST + '/',
        },
    };
}

async function loadPage(params) {
    try {
        const typeId = params.categoryId || '';
        const page = parseInt(params.page || 1);

        const res = await http_get(API_URL + '?ac=list&t=' + encodeURIComponent(typeId) + '&pg=' + page + '&pagesize=' + ITEM_LIMIT, HEADERS);
        const data = JSON.parse(res);
        const totalPages = data.pagecount || 1;

        return {
            items: formatVideos(data.list || []),
            nextPage: page < totalPages ? page + 1 : undefined,
        };
    } catch (e) {
        return { items: [] };
    }
}

globalThis.getHome = getHome;
globalThis.searchLoad = searchLoad;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
globalThis.loadPage = loadPage;
