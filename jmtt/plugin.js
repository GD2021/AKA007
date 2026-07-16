const HOST = "https://jptt.tv";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Referer": `${HOST}/`,
};

const CATEGORY_CONFIG = [
    { type_id: "sort-2", type_name: "最新發行", sort: 2, listType: "sort" },
    { type_id: "sort-3", type_name: "今日人氣", sort: 3, listType: "sort" },
    { type_id: "sort-4", type_name: "本周人氣", sort: 4, listType: "sort" },
    { type_id: "sort-5", type_name: "本月人氣", sort: 5, listType: "sort" },
    { type_id: "tag-278", type_name: "中文", tid: 278, listType: "tag" },
    { type_id: "tag-167", type_name: "第一人稱視點", tid: 167, listType: "tag" },
    { type_id: "tag-212", type_name: "無碼", tid: 212, listType: "tag" },
    { type_id: "tag-143", type_name: "合輯精選", tid: 143, listType: "tag" },
    { type_id: "tag-5", type_name: "自拍", tid: 5, listType: "tagId" },
    { type_id: "tag-634", type_name: "FC2", tid: 634, listType: "tag" },
    { type_id: "tag-58", type_name: "戲劇", tid: 58, listType: "tag" },
    { type_id: "tag-190", type_name: "粉絲感謝祭", tid: 190, listType: "tag" },
    { type_id: "tag-82", type_name: "情侶", tid: 82, listType: "tag" },
    { type_id: "tag-115", type_name: "絲襪", tid: 115, listType: "tag" },
    { type_id: "tag-136", type_name: "肉感", tid: 136, listType: "tag" },
    { type_id: "tag-95", type_name: "熟女", tid: 95, listType: "tag" },
    { type_id: "tag-193", type_name: "媽媽系", tid: 193, listType: "tag" },
    { type_id: "tag-15", type_name: "巨乳", tid: 15, listType: "tag" },
    { type_id: "tag-87", type_name: "巨尻", tid: 87, listType: "tagId" },
    { type_id: "tag-414", type_name: "風俗女郎", tid: 414, listType: "tag" },
    { type_id: "tag-137", type_name: "女上司", tid: 137, listType: "tag" },
    { type_id: "tag-305", type_name: "反向搭訕", tid: 305, listType: "tag" },
    { type_id: "tag-590", type_name: "成人卡通", tid: 590, listType: "tag" },
    { type_id: "search-風間", type_name: "風間", listType: "search", keyword: "風間" },
];

const HOME_CATEGORIES = CATEGORY_CONFIG.map(({ type_id, type_name }) => ({ type_id, type_name }));

function normalizePic(pic) {
    if (!pic) return "";
    if (pic.startsWith("//")) return "https:" + pic;
    if (!pic.startsWith("http")) return HOST + (pic.startsWith("/") ? pic : "/" + pic);
    return pic;
}

function getStyleBackgroundImage(styleStr) {
    if (!styleStr) return "";
    const match = styleStr.match(/url\(['"]?([^'")]+)['"]?\)/i);
    return match ? match[1] : "";
}

function parseListFromHtml(html, options) {
    const root = parseHtml(html);
    const titleSelector = options.titleSelector || "h3";
    const videoElements = root.querySelectorAll(".oneVideo");
    const list = [];

    for (const el of videoElements) {
        let name = "";
        if (titleSelector === "h3") {
            const h3 = el.querySelector("h3");
            name = h3 ? h3.textContent.trim() : "";
        } else if (titleSelector === "h5") {
            const h5 = el.querySelector("h5");
            name = h5 ? h5.textContent.trim() : "";
        }
        if (!name) {
            const a = el.querySelector("a");
            if (a && a.getAttribute("title")) name = a.getAttribute("title");
        }
        if (!name) {
            const img = el.querySelector("img");
            if (img && img.getAttribute("alt")) name = img.getAttribute("alt");
        }
        if (!name) name = "未知";

        const a = el.querySelector("a");
        const id = a ? a.getAttribute("href") : null;
        if (!name || !id) continue;

        let pic = "";
        const cover = el.querySelector(".index_video_cover, img");
        if (cover) {
            pic = cover.getAttribute("data-src") || cover.getAttribute("data-original") || cover.getAttribute("src") || "";
            if (!pic) {
                const style = cover.getAttribute("style");
                if (style) pic = getStyleBackgroundImage(style);
            }
        }
        pic = normalizePic(pic);

        const duration = el.querySelector(".p_duration");
        const remark = duration ? duration.textContent.trim() : "";

        list.push({
            url: HOST + (id.startsWith("/") ? "" : "/") + id,
            name: name,
            image: pic,
            info: remark,
        });
    }
    return { root, list };
}

function getTotalPages(root) {
    let lastPageLink = root.querySelector(".pagination a:last-child, .page-numbers:last-child, .pages a:last-child");
    if (lastPageLink) {
        const href = lastPageLink.getAttribute("href");
        if (href) {
            const match = href.match(/[?&](?:page|idx|p)=(\d+)/i);
            if (match) return parseInt(match[1]);
        }
    }
    let maxPage = 1;
    const pageNumbers = root.querySelectorAll(".pagination .page-numbers, .pagination a");
    for (const el of pageNumbers) {
        const num = parseInt(el.textContent);
        if (!isNaN(num) && num > maxPage) maxPage = num;
    }
    return maxPage;
}

function buildCategoryUrl(cfg, page) {
    const p = page || 1;
    if (cfg.listType === "sort") {
        return p === 1
            ? `${HOST}/list?sort=${cfg.sort}`
            : `${HOST}/list?idx=${p}&sort=${cfg.sort}`;
    }
    if (cfg.listType === "tagId") {
        return p === 1
            ? `${HOST}/tag_list?id=${cfg.tid}&idx=1`
            : `${HOST}/tag_list?id=${cfg.tid}&idx=${p}`;
    }
    if (cfg.listType === "tag") {
        return p === 1
            ? `${HOST}/tag_list?tid=${cfg.tid}`
            : `${HOST}/tag_list?id=${cfg.tid}&idx=${p}`;
    }
    if (cfg.listType === "search") {
        return p === 1
            ? `${HOST}/search?kw=${encodeURIComponent(cfg.keyword)}`
            : `${HOST}/search?kw=${encodeURIComponent(cfg.keyword)}&idx=${p}&sort=2`;
    }
    return "";
}

async function getHome() {
    try {
        const html = await http_get(HOST, HEADERS);
        const { list } = parseListFromHtml(html, { titleSelector: "h3" });
        return {
            categories: HOME_CATEGORIES,
            items: list.slice(0, 12),
        };
    } catch (e) {
        return {
            categories: HOME_CATEGORIES,
            items: [],
        };
    }
}

async function searchLoad(params) {
    try {
        const wd = params.keyword || params.wd || params.key || "";
        const page = parseInt(params.page || 1);
        if (!wd) return { items: [] };

        const url = page === 1
            ? `${HOST}/search?kw=${encodeURIComponent(wd)}`
            : `${HOST}/search?kw=${encodeURIComponent(wd)}&idx=${page}&sort=2`;
        const html = await http_get(url, HEADERS);
        const { root, list } = parseListFromHtml(html, { titleSelector: "h5" });

        let totalPages = getTotalPages(root);
        if (totalPages < page) totalPages = page;

        return {
            items: list,
            nextPage: page < totalPages ? page + 1 : undefined,
        };
    } catch (e) {
        return { items: [] };
    }
}

async function load(url) {
    try {
        const detailUrl = url.startsWith("http") ? url : HOST + (url.startsWith("/") ? "" : "/") + url;
        const html = await http_get(detailUrl, HEADERS);
        const root = parseHtml(html);

        const h1 = root.querySelector("h1.h1_title");
        const name = h1 ? h1.textContent.trim() : "未知标题";

        let pic = "";
        const video = root.querySelector("video");
        if (video) pic = video.getAttribute("poster") || "";
        if (!pic) {
            const ogImage = root.querySelector('meta[property="og:image"]');
            if (ogImage) pic = ogImage.getAttribute("content") || "";
        }
        if (!pic) {
            const cover = root.querySelector(".index_video_cover");
            if (cover) {
                pic = cover.getAttribute("data-src") || cover.getAttribute("src") || "";
                if (!pic) {
                    const style = cover.getAttribute("style");
                    if (style) pic = getStyleBackgroundImage(style);
                }
            }
        }
        pic = normalizePic(pic);

        const infoP = root.querySelector(".info_original p");
        const remark = infoP ? infoP.textContent.trim() : name;

        let m3u8Url = "";
        const combinedMatch = html.match(/(?:<source\s+src=['"]([^'"]+)|https?:\/\/[^"'']+hlsredirect[^"'']*\.m3u8|https?:\/\/[^"'\s]+\.m3u8|\/\/[^"'']+hlsredirect[^"'']*\.m3u8)/i);
        if (combinedMatch) {
            let matched = combinedMatch[0];
            if (matched.startsWith("<source")) {
                const srcMatch = matched.match(/src=['"]([^'"]+)/i);
                if (srcMatch) m3u8Url = srcMatch[1];
            } else {
                m3u8Url = matched;
            }
        }
        if (m3u8Url && m3u8Url.startsWith("//")) m3u8Url = "https:" + m3u8Url;
        if (m3u8Url && m3u8Url.startsWith("/")) m3u8Url = HOST + m3u8Url;

        return {
            name: name,
            image: pic,
            info: remark,
            episodes: [{
                name: "正片",
                url: m3u8Url || detailUrl,
            }],
        };
    } catch (e) {
        return { name: "", image: "", info: "", episodes: [] };
    }
}

async function loadStreams(episodeUrl) {
    return {
        urls: [{ name: "播放", url: episodeUrl }],
        headers: { Referer: HOST },
    };
}

async function loadPage(params) {
    try {
        const categoryId = params.categoryId || params.type_id || "";
        const page = parseInt(params.page || 1);

        const cfg = CATEGORY_CONFIG.find(c => c.type_id === categoryId);
        if (!cfg) return { items: [] };

        const url = buildCategoryUrl(cfg, page);
        const titleSelector = cfg.listType === "sort" ? "h5" : "h3";
        const html = await http_get(url, HEADERS);
        const { root, list } = parseListFromHtml(html, { titleSelector });

        let totalPages = getTotalPages(root);
        if (totalPages < page) totalPages = page;

        return {
            items: list,
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
