# Content Collectors 实现指南

## 概述

Content Collectors 是 Chrome Extension 的内容脚本，负责从不同平台（X.com、Bilibili、Weibo、QZone）自动采集内容。每个平台有独立的 collector，遵循统一的架构模式。

## 整体设计逻辑

每个 collector 的核心流程：

1. **配置检查** - 检查用户是否配置了该平台的目标用户
2. **目标验证** - 验证当前页面是否是目标用户的页面
3. **间隔检查** - 检查采集时间间隔，防止频繁采集
4. **页面加载** - 等待页面完全加载
5. **元素获取** - 获取页面中的内容元素
6. **内容解析** - 提取文本、图片、视频、元数据
7. **后台保存** - 发送到后台脚本保存到 Notion

## 添加新平台 Collector 的完整步骤

### 1️⃣ 创建 Collector 文件

创建 `chrome-extension/content/[platform]-collector.ts`

**文件结构模板：**

```typescript
/**
 * [Platform] Content Collector
 * Extracts posts from [Platform] pages
 */

// Message types for communication with background script
const MessageType[Platform] = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    COLLECT_RESULT: 'COLLECT_RESULT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
} as const;

// ============ 数据提取函数 ============

/**
 * Extract text content from a [platform] post element
 */
function extractText[Platform](postElement: Element): string {
    // 实现逻辑
}

/**
 * Extract images from a [platform] post element
 */
function extractImages[Platform](postElement: Element): string[] {
    // 实现逻辑
}

/**
 * Extract videos from a [platform] post element
 */
function extractVideos[Platform](postElement: Element): string[] {
    // 实现逻辑
}

/**
 * Extract author information from a [platform] post
 */
function extractAuthor[Platform](postElement: Element): AuthorInfo {
    // 返回 { username, displayName }
}

/**
 * Extract timestamp from a [platform] post
 */
function extractTimestamp[Platform](postElement: Element): string {
    // 返回 ISO 格式时间戳
}

/**
 * Extract URL from a [platform] post
 */
function extractUrl[Platform](postElement: Element): string {
    // 返回完整的帖子 URL
}

/**
 * Detect content type
 */
function detectType[Platform](postElement: Element): ContentType {
    // 返回 'text' | 'image' | 'video' | 'article' | 'unknown'
}

// ============ 页面识别函数 ============

/**
 * Get current page's user ID from URL
 */
function getCurrentPageUID[Platform](): string {
    // 从 URL 提取用户 ID
    // 例: weibo.com/u/7480129679 → 7480129679
}

/**
 * Check if current page is a [platform] user page
 */
function is[Platform]Page(): boolean {
    // 检查 hostname 和 pathname
    // 例: weibo.com && /u/\d+ 或 space.bilibili.com && /dynamic
}

/**
 * Check if current page is the target user's page
 */
function isTargetURL[Platform](targetUID: string): boolean {
    if (!targetUID) return false;
    const pageUID = getCurrentPageUID[Platform]();
    const isPage = is[Platform]Page();
    return isPage && pageUID === targetUID;
}

// ============ 主要采集函数 ============

/**
 * Find all posts on the current page
 */
function findAllPosts[Platform](): Element[] {
    // 使用 CSS 选择器找到所有帖子容器
    const posts = document.querySelectorAll('[selector-for-posts]');
    return Array.from(posts).filter(post => {
        // 过滤出有实际内容的帖子
        return post.querySelector('[content-selector]') !== null;
    });
}

/**
 * Collect data from a single post
 */
function collectPostData[Platform](postElement: Element): CollectedContent {
    const text = extractText[Platform](postElement);
    const images = extractImages[Platform](postElement);
    const videos = extractVideos[Platform](postElement);
    const author = extractAuthor[Platform](postElement);
    const timestamp = extractTimestamp[Platform](postElement);
    const url = extractUrl[Platform](postElement);
    const type = detectType[Platform](postElement);

    return {
        source: '[Platform]',
        type,
        text,
        images,
        videos,
        timestamp,
        url,
        author,
        collectedAt: new Date().toISOString()
    };
}

// ============ 获取页面信息 ============

/**
 * Get page info for the popup
 */
async function getPageInfo[Platform](): Promise<PageInfo> {
    const posts = findAllPosts[Platform]();
    const pageUID = getCurrentPageUID[Platform]();

    // 获取配置以检查是否是目标页面
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    const targetUID = response?.config?.target[Platform]User;
    const isMatched = (targetUID && pageUID === targetUID) || false;

    return {
        is[Platform]Page: isMatched,
        isPage: is[Platform]Page(),
        postCount: posts.length,
        currentUrl: window.location.href,
        pageUID: pageUID
    } as PageInfo;
}

// ============ 自动采集核心逻辑 ============

/**
 * Auto-collect ALL visible posts on page load
 * 这是最重要的函数，包含完整的采集流程
 */
async function tryAutoCollect[Platform](): Promise<void> {
    // 0. 获取配置
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;
    const config = response.config;

    // 1. 检查配置：是否配置了目标用户
    if (!config.target[Platform]User) {
        console.log('[Synapse] Target [Platform] user not configured, skipping auto-collect');
        return;
    }

    // 2. 验证目标 URL
    if (!isTargetURL[Platform](config.target[Platform]User)) {
        return;
    }

    // 3. 检查采集间隔
    const interval = config.collectIntervalHours ?? 4;
    const lastCollectForSource = config.lastCollectTimes?.[platform];
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;
    const now = Date.now();

    if (interval > 0 && lastCollect > 0) {
        const hoursSinceLast = (now - lastCollect) / (1000 * 60 * 60);
        if (hoursSinceLast < interval) {
            console.log(`[Synapse] Skipping auto-collect for [Platform]: last collect was ${hoursSinceLast.toFixed(2)} hours ago (interval: ${interval}h)`);
            return;
        }
    }

    // 4. 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    const allPosts = findAllPosts[Platform]();

    if (allPosts.length === 0) {
        console.log('[Synapse] No posts found to collect');
        return;
    }

    const pageUID = getCurrentPageUID[Platform]();

    // 5. 解析内容
    const allContent = allPosts.map((element) => {
        const data = collectPostData[Platform](element);
        // 添加 UID 作为用户名用于目标用户验证
        data.author = { username: pageUID, displayName: pageUID };
        return data;
    }).filter(data => data.text && data.text.trim().length > 0);

    // 6. 发送到后台保存
    chrome.runtime.sendMessage({
        type: 'CONTENT_TO_BG_PROCESS',
        contents: allContent,
        pageUID: pageUID
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] [Platform] auto-collected ${response.collected} items`);
        }
    });
}

// ============ 消息监听 ============

/**
 * Listen for messages from popup/background
 */
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === MessageType[Platform].COLLECT_CURRENT) {
        const posts = findAllPosts[Platform]();

        if (posts.length === 0) {
            sendResponse({ success: false, error: 'No posts found' });
            return true;
        }

        const allContent = posts.map(element => collectPostData[Platform](element))
            .filter(data => data.text && data.text.trim().length > 0);

        sendResponse({ success: true, data: allContent });
        return true;
    } else if (message.type === 'POP_TO_CONTENT_COLLECT') {
        const pageUID = getCurrentPageUID[Platform]();
        const allPosts = findAllPosts[Platform]();

        if (allPosts.length === 0) {
            sendResponse({ success: false, error: 'No posts found on page' });
            return true;
        }

        const allContent = allPosts.map(element => {
            const data = collectPostData[Platform](element);
            data.author = { username: pageUID, displayName: pageUID };
            return data;
        }).filter(data => data.text && data.text.trim().length > 0);

        // 发送到后台处理
        chrome.runtime.sendMessage({
            type: 'CONTENT_TO_BG_PROCESS',
            contents: allContent,
            pageUID: pageUID
        }, response => {
            sendResponse(response);
        });
        return true;
    } else if (message.type === MessageType[Platform].GET_PAGE_INFO) {
        getPageInfo[Platform]().then(info => sendResponse(info));
        return true;
    }
    return true;
});

// ============ 初始化和事件监听 ============

/**
 * Initialization logic
 * 页面加载时的初始化和事件监听
 */
(() => {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: '[platform]' });
    tryAutoCollect[Platform]();

    let lastUrl = window.location.href;
    let lastScrollTop = 0;
    let debounceTimer: number | undefined;

    const triggerCollect = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            tryAutoCollect[Platform]();
        }, 10000); // 等待 10 秒
    };

    // 1. 监听 URL 变化
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            if (debounceTimer) clearTimeout(debounceTimer);
            tryAutoCollect[Platform]();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 2. 监听滚动事件 (防抖)
    window.addEventListener('scroll', () => {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > lastScrollTop) {
            // 向下滚动
            triggerCollect();
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });
})();
```

### 2️⃣ 更新类型定义

编辑 `lib/types.d.ts`：

```typescript
interface CollectedContent {
    source: 'X' | 'Bilibili' | 'QZone' | 'Weibo' | '[NewPlatform]';  // 添加新平台
    // ... 其他字段
}

interface AppConfig {
    // ... 其他配置
    target[Platform]User: string;  // 新增字段
}
```

### 3️⃣ 更新存储配置

编辑 `lib/storage.ts`：

```typescript
export const STORAGE_KEYS = {
    // ... 其他键
    TARGET_[PLATFORM]_USER: 'target[Platform]User',  // 新增
};

const DEFAULT_CONFIG: Partial<AppConfig> = {
    enabledSources: ['x', 'bilibili', 'qzone', '[platform]'],  // 添加新平台
};

async function getConfig(): Promise<AppConfig> {
    return {
        // ... 其他字段
        target[Platform]User: (result[STORAGE_KEYS.TARGET_[PLATFORM]_USER] as string) || '',  // 新增
    };
}
```

### 4️⃣ 更新 manifest.json

```json
{
    "host_permissions": [
        // ... 其他权限
        "https://[domain]/*"  // 新增平台的域名权限
    ],
    "content_scripts": [
        // ... 其他脚本
        {
            "matches": ["https://[domain]/*"],
            "js": ["dist/content/[platform]-collector.js"],
            "run_at": "document_idle"
        }
    ]
}
```

### 5️⃣ 更新 Options 页面

编辑 `options/options.html`：

```html
<div class="input-group">
    <label for="target[Platform]User">[Platform] UID</label>
    <input type="text" id="target[Platform]User" placeholder="user-id">
    <p class="hint">Find your [Platform] UID from: [URL pattern]</p>
</div>
```

编辑 `options/options.ts`：

```typescript
const elements = {
    // ... 其他元素
    target[Platform]User: document.getElementById('target[Platform]User') as HTMLInputElement,
};

async function loadConfig() {
    // ... 其他加载
    elements.target[Platform]User.value = config.target[Platform]User || '';
}

async function handleSave() {
    const config: AppConfig = {
        // ... 其他配置
        target[Platform]User: elements.target[Platform]User.value.trim(),
        enabledSources: ['x', 'bilibili', 'qzone', '[platform]']
    };
}
```

### 6️⃣ 添加测试

编辑 `content/collector.test.ts`：

```typescript
// 在 collectors 数组中添加
const collectors = [
    // ... 其他 collectors
    'dist/content/[platform]-collector.js'
];

// 添加测试用例
test("[Platform] Collector", () => {
    const htmlPath = join(TARGET_HTML_DIR, "[platform].html");
    const jsonPath = join(TARGET_HTML_DIR, "[platform].json");

    updateDOMWithUrl(htmlPath, "https://[domain]/user");

    const posts = (globalThis as any).findAllPosts[Platform]();
    expect(posts.length).toBeGreaterThan(0);

    const results = posts.map((p: any) => (globalThis as any).collectPostData[Platform](p));

    // 只覆盖 collectedAt，保留解析的时间戳
    results.forEach((r: any) => {
        r.collectedAt = "2024-01-01T00:00:00.000Z";
    });

    if (!existsSync(jsonPath)) {
        writeFileSync(jsonPath, JSON.stringify(results, null, 2));
        console.log(`Created ${jsonPath}. Please review it.`);
    } else {
        const expected = JSON.parse(readFileSync(jsonPath, "utf-8"));
        expect(results).toEqual(expected);
    }
});
```

### 7️⃣ 创建测试 HTML 和参考数据

创建 `target-html/[platform].html` - 实际页面的 HTML 快照
创建 `target-html/[platform].json` - 预期的提取结果

### 8️⃣ 更新文档

编辑 `README.md`：
- 更新项目描述
- 添加新平台的使用说明
- 更新配置说明

## 关键设计模式

### 1. 命名规范

- 所有平台特定的函数添加 `[Platform]` 后缀
- 避免全局命名冲突
- 例：`extractText[Platform]()`, `isTargetURL[Platform]()`

### 2. 配置驱动采集

关键检查点按顺序执行：

```
配置存在性 → 目标 URL 验证 → 采集间隔检查 → 页面加载 → 元素获取 → 内容解析
```

只有所有检查都通过才会进行采集。

### 3. 消息通信协议

- `COLLECT_CURRENT` - 单次采集（用户手动触发）
- `POP_TO_CONTENT_COLLECT` - 批量采集（点击按钮）
- `GET_PAGE_INFO` - 获取页面信息（用于 popup）
- `CONTENT_TO_BG_PROCESS` - 发送到后台处理

### 4. 数据结构

所有 collector 返回统一的 `CollectedContent` 接口：

```typescript
{
    source: string;           // 平台名称
    type: ContentType;        // 'text' | 'image' | 'video' | 'article' | 'unknown'
    text: string;            // 帖子文本
    images: string[];        // 图片 URLs
    videos: string[];        // 视频 URLs
    timestamp: string;       // ISO 格式时间戳
    url: string;            // 帖子链接
    author: AuthorInfo;      // { username, displayName }
    collectedAt: string;     // 采集时间
}
```

### 5. 时间戳处理

支持两种时间戳：
- **相对时间**：刚刚、5分钟前、昨天等
- **绝对时间**：日期字符串、时间属性

优先级：title 属性 > datetime 属性 > 可见文本

### 6. 采集触发条件

自动采集在以下情况触发：
1. 页面初始加载
2. URL 变化（通过 MutationObserver）
3. 用户滚动（防抖 10 秒）

## 实现 Weibo Collector 的完整示例

参考 `weibo-collector.ts` 获取实际的完整实现示例，包括：
- DOM 选择器的具体实现
- 平台特定的数据提取逻辑
- 错误处理和边界情况
- 图片过滤（排除头像、小图标）

## 常见问题

### Q: 如何处理动态加载的内容？

A: 在 `tryAutoCollect` 中添加等待时间（通常 2-3 秒），然后再获取元素。对于无限滚动页面，通过滚动监听自动触发采集。

### Q: 如何避免重复采集？

A: 后台脚本通过 `OriginalURL` 检查重复。确保 `extractUrl()` 为每条内容返回唯一的 URL。

### Q: 时间戳应该什么时候采集？

A: 在页面上显示的发布时间。使用 ISO 8601 格式（YYYY-MM-DDTHH:mm:ss.sssZ）以保证一致性。

### Q: 为什么需要 `getCurrentPageUID()`？

A: 用于验证是否在目标用户的页面，以及后台验证采集的内容来自正确的用户。

### Q: 如何处理图片 URL 的不同格式？

A: 标准化图片 URL，去除查询参数，统一为最高质量的版本。参考 `weibo-collector.ts` 中的过滤逻辑。

## 测试和调试

### 构建和测试

```bash
# 编译 TypeScript
npm run build

# 运行测试
npm run test

# 观察模式
npm run watch
```

### 查看日志

在 Chrome DevTools 中查看：
- 内容脚本日志：Inspect 页面（F12）
- 后台脚本日志：chrome://extensions → Service Worker

## 总结

实现新的 collector：

1. ✅ 创建 collector 文件（遵循模板）
2. ✅ 更新类型定义和存储配置
3. ✅ 更新 manifest 和 options 页面
4. ✅ 添加测试用例
5. ✅ 更新文档
6. ✅ 运行 `npm run build && npm run test`

遵循这个指南，可以轻松为任何新平台添加支持！
