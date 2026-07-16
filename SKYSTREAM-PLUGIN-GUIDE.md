# SkyStream 插件开发完全指南

## 一、插件架构

SkyStream 插件是一个 IIFE（立即执行函数），暴露 4 个全局函数：

```javascript
(function () {
    // manifest 在 IIFE 顶层即可访问（部分插件写法）
    var BASE = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl)
        ? manifest.baseUrl : 'https://fallback-url.com';

    var HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Referer': BASE + '/'
    };

    // 1. 首页：返回 { "分类名": [MultimediaItem, ...], ... }
    async function getHome(cb) { ... }

    // 2. 搜索：返回 [MultimediaItem, ...]
    async function search(query, cb) { ... }

    // 3. 详情：返回 MultimediaItem（含演员、简介、分集等）
    async function load(url, cb) { ... }

    // 4. 视频流：返回 [StreamResult, ...]
    async function loadStreams(url, cb) { ... }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
```

## 二、内置 API

| API | 说明 |
|-----|------|
| `http_get(url, headers, timeout)` | GET 请求，返回 `{ body, status }` |
| `http_post(url, headers, body)` | POST 请求 |
| `parseHtml(htmlString)` | 将 HTML 字符串解析为 DOM 文档 |
| `btoa(str)` | Base64 编码 |
| `atob(str)` | Base64 解码 |
| `encodeURIComponent(str)` | URL 编码 |
| `decodeURIComponent(str)` | URL 解码 |
| `loadExtractor(url)` | 解析视频托管站（MixDrop、StreamTape 等） |

## 三、核心类

### MultimediaItem
```javascript
new MultimediaItem({
    title: string,           // 标题（必填）
    url: string,             // 唯一标识，传给 load() 和 loadStreams()
    posterUrl: string,       // 封面图 URL
    backgroundPosterUrl: string, // 背景图（可选）
    bannerUrl: string,       // 横幅图（可选）
    type: 'movie' | 'series' | 'livestream',
    description: string,     // 简介
    year: number,            // 年份
    cast: [Actor],           // 演员数组
    director: string,
    studio: string,
    tags: [string],
    score: number,
    episodes: [Episode],     // 剧集（非 movie 类型时必需）
    recommendations: [MultimediaItem], // 推荐
    headers: {}              // 自定义请求头
})
```

### Episode
```javascript
new Episode({
    name: string,       // 集名
    url: string,        // 传给 loadStreams()
    season: number,     // 第几季（movie 用 1）
    episode: number,    // 第几集（movie 用 1）
    posterUrl: string,
    description: string,
    headers: {}
})
```

### StreamResult
```javascript
new StreamResult({
    url: string,        // 视频流 URL
    quality: string,    // '720p' / '1080p' / '4K'
    type: 'hls' | 'mp4' | 'mkv',
    source: string,     // 来源名称（可选）
    headers: {},        // 自定义请求头（重要！）
})
```

### Actor
```javascript
new Actor({ name: string, image: string })
```

## 四、关键注意事项

### 1. URL 格式必须统一

⚠️ **永远使用完整 URL 作为 `url` 字段**，不要用短 ID！

```javascript
// ✅ 正确——和 KoreanPornMovie 一致
url: BASE + '/video/' + vid

// ❌ 错误——会导致 View All 翻页失效
url: vid  // 只有 ID，没有域名
```

原因：SkyStream 的 View All 页面依赖 `url` 字段的完整性。完整 URL 才能让 `load()` 直接发起 HTTP 请求。

### 2. 并行抓取提速

```javascript
// ✅ 正确——页面间并行，再合并去重
var pages = await Promise.all([1, 2, 3].map(async function (p) {
    var res = await http_get(pageUrl(slug, p), HEADERS);
    if (!res || res.status !== 200) return [];
    return parseItems(await parseHtml(res.body));
}));
var seen = {}, merged = [];
for (var i = 0; i < pages.length; i++) {
    for (var j = 0; j < pages[i].length; j++) {
        var item = pages[i][j];
        if (!seen[item.url]) { seen[item.url] = true; merged.push(item); }
    }
}

// ❌ 错误——串行抓取，首页加载慢
for (var p = 1; p <= 3; p++) {
    var res = await http_get(...);
    // ...
}
```

### 3. 使用 `parseHtml()` + DOM 选择器

```javascript
// ✅ 正确
var doc = await parseHtml(res.body);
var title = doc.querySelector('h1#title');
var text = title ? (title.textContent || title.innerText || '').trim() : '';

// ❌ 避免——正则解析 HTML 脆弱、难以维护
var titleMatch = html.match(/<h1[^>]*id="title"[^>]*>([\s\S]*?)<\/h1>/i);
```

**工具函数：**
```javascript
function text(el) { return el ? (el.textContent || el.innerText || '').trim() : ''; }
function fixUrl(u) {
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('http') === 0) return u;
    return BASE + (u.indexOf('/') === 0 ? '' : '/') + u;
}
```

### 4. 流加载策略——快进不转圈

```javascript
// ✅ 正确：直连 m3u8 作为首选，API 结果作为备选
async function loadStreams(url, cb) {
    var streams = [];

    // 主选：直接拼接的 m3u8（无网络请求）
    streams.push(new StreamResult({
        url: 'https://video10.memojav.net/stream/' + vid + '/master.m3u8',
        quality: '720p', type: 'hls', headers: HEADERS
    }));

    // 备选：API 返回的高清流
    try {
        var res = await http_get(apiUrl, HEADERS);
        // ... 解析后添加 1080p/720p MP4
    } catch (_) {}

    cb({ success: true, data: streams });
}
```

### 5. 检查 HTTP 状态码

```javascript
// ✅ 正确
if (!res || res.status !== 200) return [];
```

### 6. `manifest` 访问

部分 SkyStream 版本在 IIFE 顶层即可访问 `manifest`：
```javascript
var BASE = manifest.baseUrl; // 某些版本可以
```

更安全的写法：
```javascript
var BASE = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl)
    ? manifest.baseUrl : 'https://default-url.com';
```

### 7. `search` 不能空着

```javascript
// ❌ 这样用户无法搜索
async function search(query, cb) { cb({ success: true, data: [] }); }

// ✅ 至少实现基本搜索
async function search(query, cb) {
    var res = await http_get(BASE + '/search?s=' + encodeURIComponent(query), HEADERS);
    if (!res || res.status !== 200) return cb({ success: true, data: [] });
    var doc = await parseHtml(res.body);
    var items = parseItems(doc); // 复用首页解析函数
    cb({ success: true, data: items });
}
```

## 五、部署流程

```bash
# 1. 用 esbuild 打包
npx esbuild memojav/plugin.js --bundle --minify --target=es2016 --outfile=memojav/.build/plugin.bundled.js

# 2. 部署（URL 结尾不要 /repo.json！）
skystream deploy -u "https://raw.githubusercontent.com/GD2021/AKA007/main"

# 3. 提交推送
git add -A
git commit -m "描述修改内容"
git push
```

⚠️ `raw.githubusercontent.com` CDN 缓存约 5-10 分钟。

## 六、常见踩坑

| 问题 | 原因 | 解决 |
|------|------|------|
| 装不上插件 | `plugin.json` 里 `domains` 字段导致 | 删除 `domains` |
| 首页只有 1-2 个分类 | `getHome` 只抓了少量分类 | 用 `Promise.all` 并行抓取 6-10 个分类 |
| View All 不能翻页 | `url` 字段用了短 ID 而非完整 URL | 改为 `BASE + '/video/' + vid` |
| View All 只有 12 项 | `getHome` 每分类只返回了一页 | 每分类并行抓取 3-5 页合并 |
| 起播快但快进转圈 | 只返回了 MP4 流或 API 返回的 URL 不支持 seeking | 返回 `video10.memojav.net` 直连 m3u8 作为首选 |
| 图片不显示 | `posterUrl` 是相对路径 | 用 `fixUrl()` 转为绝对路径 |
| `manifest is not defined` | 在 IIFE 顶层访问 `manifest` | 用 `typeof` 检查或包在函数里 |
| 搜索无结果 | 网站搜索需要特定参数 | 检查网站实际搜索 URL 格式 |

## 七、目录结构

```
project-root/
├── repo.json              # 仓库清单（指向 dist/plugins.json）
├── memojav/
│   ├── plugin.json        # 插件元数据（包名、版本、作者等）
│   ├── plugin.js          # 插件源码（IIFE）
│   └── .build/
│       └── plugin.bundled.js  # esbuild 打包输出
└── dist/
    ├── plugins.json       # 部署索引
    └── com.memojav.provider.sky  # 最终分发文件
```

## 八、plugin.json 模板

```json
{
    "packageName": "com.example.provider",
    "name": "MyProvider",
    "version": 1,
    "baseUrl": "https://example.com",
    "description": "Description",
    "authors": ["YourName"],
    "languages": ["ja", "en"],
    "categories": ["Movie"]
}
```
