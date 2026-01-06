/**
 * QZone Content Collector
 * Extracts feed content from QQ Zone pages
 */


// Message types for communication with background script
const MessageTypeQZone = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    COLLECT_RESULT: 'COLLECT_RESULT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
} as const;

/**
 * Extract text content from a QZone feed element
 */
function extractFeedTextQZone(item: Element): string {
    // Try to find the complete (expanded) text element first
    const infoElement = item.querySelector('.f-info.qz_info_complete') || item.querySelector('.f-info');
    if (infoElement) {
        const content = infoElement.querySelector('.f-content');
        if (content) return (content as HTMLElement).innerText.trim();

        const clone = infoElement.cloneNode(true) as HTMLElement;
        const media = clone.querySelector('.f-media, .f-list-img, .f-video');
        if (media) media.remove();
        return clone.innerText.trim();
    }
    return '';
}

/**
 * Extract images from a QZone feed element
 */
function extractFeedImagesQZone(item: Element): string[] {
    const images: string[] = [];

    // 1. Standard img tags in known containers
    const imgElements = item.querySelectorAll('.f-info img, .f-media img, .f-list-img img, .img-item img, .photo-item img, .pic-item img');
    imgElements.forEach(img => {
        const htmlImg = img as HTMLImageElement;
        let src = htmlImg.getAttribute('data-src') ||
            htmlImg.getAttribute('orgsrc') ||
            htmlImg.getAttribute('original_src') ||
            htmlImg.src;

        if (src && !src.includes('qzone_v5/client/') &&
            !src.includes('qzonestyle.gtimg.cn') &&
            !src.includes('loading.gif') &&
            !src.startsWith('data:')) {
            src = src.replace(/\/m\/(\d+)\//, '/b/$1/').replace(/\/s\/(\d+)\//, '/b/$1/');
            images.push(src);
        }
    });

    // 2. Background images in certain elements (common for some types of feeds)
    const bgElements = item.querySelectorAll('[style*="background-image"]');
    bgElements.forEach(el => {
        const style = (el as HTMLElement).style.backgroundImage;
        if (style) {
            const match = style.match(/url\(["']?(.*?)["']?\)/);
            if (match && match[1]) {
                let src = match[1];
                if (!src.includes('qzone_v5/client/') &&
                    !src.includes('qzonestyle.gtimg.cn') &&
                    !src.includes('loading.gif') &&
                    !src.startsWith('data:')) {
                    src = src.replace(/\/m\/(\d+)\//, '/b/$1/').replace(/\/s\/(\d+)\//, '/b/$1/');
                    images.push(src);
                }
            }
        }
    });

    return [...new Set(images)];
}

function extractFeedTimestampQZone(item: Element): string {
    // Try to find the time element
    const timeElement = item.querySelector('.f-time') ||
        item.querySelector('.abritary') ||
        item.querySelector('.state') ||
        item.querySelector('.f-info .c_tx3');

    if (timeElement) {
        // Many QZone elements have the full date in the title attribute
        const titleTime = timeElement.getAttribute('title');
        if (titleTime && titleTime.match(/\d{4}-\d{1,2}-\d{1,2}/)) {
            const date = new Date(titleTime.replace(/-/g, '/'));
            if (!isNaN(date.getTime())) return date.toISOString();
        }

        const timeText = (timeElement as HTMLElement).innerText.trim();
        if (timeText) {
            return parseQZoneTimeQZone(timeText);
        }
    }

    // Fallback: search for anything that looks like time in f-info
    const infoText = (item.querySelector('.f-info') as HTMLElement)?.innerText || '';
    const dateMatch = infoText.match(/(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})/);
    if (dateMatch) {
        const date = new Date(dateMatch[1].replace(/-/g, '/'));
        if (!isNaN(date.getTime())) return date.toISOString();
    }

    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString();
}

/**
 * Parse QZone time string to ISO format
 */
function parseQZoneTimeQZone(timeText: string): string {
    const now = new Date();
    // Normalize to minute to ensure stable URLs for deduplication
    now.setSeconds(0, 0);

    // Handle relative: "X小时前", "X分钟前"
    const hourMatch = timeText.match(/(\d+)\s*小时前/);
    if (hourMatch) {
        now.setHours(now.getHours() - parseInt(hourMatch[1]));
        return now.toISOString();
    }
    const minuteMatch = timeText.match(/(\d+)\s*分钟前/);
    if (minuteMatch) {
        now.setMinutes(now.getMinutes() - parseInt(minuteMatch[1]));
        return now.toISOString();
    }

    // Handle: "昨天 12:34"
    if (timeText.includes('昨天')) {
        const timePart = timeText.match(/\d{1,2}:\d{2}/);
        now.setDate(now.getDate() - 1);
        if (timePart) {
            const [h, m] = timePart[0].split(':');
            now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        return now.toISOString();
    }

    // Handle: "前天 12:34"
    if (timeText.includes('前天')) {
        const timePart = timeText.match(/\d{1,2}:\d{2}/);
        now.setDate(now.getDate() - 2);
        if (timePart) {
            const [h, m] = timePart[0].split(':');
            now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        return now.toISOString();
    }

    // Handle: "12:34" (Today)
    const todayMatch = timeText.match(/^(\d{1,2}):(\d{2})$/);
    if (todayMatch) {
        now.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]), 0, 0);
        return now.toISOString();
    }

    // Handle Chinese absolute: "2025年8月23日 11:58" or "8月23日 11:58"
    const cnDateMatch = timeText.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
    if (cnDateMatch) {
        let year = parseInt(cnDateMatch[1]) || now.getFullYear();
        let month = parseInt(cnDateMatch[2]) - 1;
        let day = parseInt(cnDateMatch[3]);
        let hour = parseInt(cnDateMatch[4]);
        let minute = parseInt(cnDateMatch[5]);

        // Create Date as UTC+8 (Beijing Time)
        const date = new Date(Date.UTC(year, month, day, hour, minute));
        date.setUTCHours(date.getUTCHours() - 8);
        return date.toISOString();
    }

    // Handle absolute: "2024-12-30 14:00" or "12-30 14:00"
    const dateMatch = timeText.match(/(?:(\d{4})-)?(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (dateMatch) {
        let year = parseInt(dateMatch[1]) || now.getFullYear();
        let month = parseInt(dateMatch[2]) - 1;
        let day = parseInt(dateMatch[3]);
        let hour = parseInt(dateMatch[4]);
        let minute = parseInt(dateMatch[5]);

        // Create Date as UTC+8 (Beijing Time)
        const date = new Date(Date.UTC(year, month, day, hour, minute));
        date.setUTCHours(date.getUTCHours() - 8);
        return date.toISOString();
    }

    return now.toISOString();
}

/**
 * Extract feed URL
 */
function extractFeedUrlQZone(item: Element, timestamp: string, text: string): string {
    let baseUrl = window.location.href;
    try {
        if (window.parent && window.parent.location.hostname.includes('qzone.qq.com')) {
            baseUrl = window.parent.location.href;
        }
    } catch (e) { /* ignore cross-origin */ }

    // Clean up base URL
    baseUrl = baseUrl.split('#')[0].split('?')[0];

    // Create a stable fingerprint based on content and time
    // We avoid using DOM IDs like feedId because they can be unstable in QZone
    const contentHash = btoa(unescape(encodeURIComponent(text.substring(0, 100)))).substring(0, 12);
    const timeHash = btoa(timestamp).substring(0, 10);
    
    // Get author to make the hash even more unique across different spaces
    const author = extractAuthorInfoQZone(item);
    const authorHash = author.username ? btoa(author.username).substring(0, 6) : '';

    const salt = `h-${authorHash}-${contentHash}-${timeHash}`;

    const highlightText = text.substring(0, 50).trim();
    if (highlightText) {
        const encodedText = encodeURIComponent(highlightText);
        return `${baseUrl}#:~:text=${encodedText}&synapse=${salt}`;
    }

    return `${baseUrl}#synapse-${salt}`;
}

/**
 * Extract author info
 */
function extractAuthorInfoQZone(item: Element): AuthorInfo {
    const nameElement = (item.querySelector('.f-nick a') || item.querySelector('.f-nick')) as HTMLAnchorElement;
    const displayName = nameElement ? nameElement.innerText.trim() : '';

    let username = '';
    if (nameElement && nameElement.href) {
        const match = nameElement.href.match(/qzone\.qq\.com\/(\d+)/);
        if (match) username = match[1];
    }

    const parentWindow = window.parent as any;
    if (!username && parentWindow && parentWindow.g_iUin) {
        username = parentWindow.g_iUin.toString();
    }

    return { username, displayName };
}

/**
 * Collect data from a single feed element
 */
function collectFeedDataQZone(item: Element): CollectedContent {
    const text = extractFeedTextQZone(item);
    const images = extractFeedImagesQZone(item);
    const timestamp = extractFeedTimestampQZone(item);
    const author = extractAuthorInfoQZone(item);
    const url = extractFeedUrlQZone(item, timestamp, text);

    return {
        source: 'QZone' as const,
        type: images.length > 0 ? 'image' : 'text',
        text,
        images,
        videos: [],
        timestamp,
        url,
        author,
        collectedAt: new Date().toISOString()
    };
}

/**
 * Find all feed elements
 */
/**
 * Find all feeds on the page and collect their data
 */
function findAllQzoneFeeds(): CollectedContent[] {
    const feeds = findAllFeedsQZone();
    return feeds.map(f => collectFeedDataQZone(f)).filter(data => data.text && data.text.trim().length > 0);
}

function findAllFeedsQZone(): Element[] {
    // Try both modern and classic selectors
    const selectors = [
        'li.f-single',
        '.feed_item',
        'div[id^="feed_"]',
        'div[id^="f_"]'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            return Array.from(elements);
        }
    }

    return [];
}

/**
 * Get the QQ number from current page URL
 * QZone URL format: user.qzone.qq.com/[QQ]/main or user.qzone.qq.com/[QQ]/infocenter
 */
function getPageQQ(): string {
    const url = window.location.href;
    // Check for user.qzone.qq.com/[QQ]/main or similar
    const match = url.match(/user\.qzone\.qq\.com\/(\d+)/);
    return match ? match[1] : '';
}

/**
 * Check if current page is the main feed page
 */
function isQZoneMainPage(): boolean {
    const url = window.location.href;
    // Main feed is usually at /main or /infocenter
    return url.includes('/main') || url.includes('/infocenter');
}

/**
 * Get page info for the popup
 */
function getPageInfoQZone(): PageInfo {
    const feeds = findAllFeedsQZone();
    const pageQQ = getPageQQ();

    return {
        isQZonePage: true,
        feedCount: feeds.length,
        currentUrl: window.location.href,
        pageQQ: pageQQ
    } as PageInfo;
}



// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message.type === MessageTypeQZone.COLLECT_CURRENT) {
        const allFeeds = findAllFeedsQZone();
        if (allFeeds.length === 0) {
            sendResponse({ success: false, error: '未找到动态内容' });
            return true;
        }

        const data = collectFeedDataQZone(allFeeds[0]);

        if (message.targetUser) {
            const pageQQ = getPageQQ();
            if (pageQQ && pageQQ !== message.targetUser) {
                sendResponse({
                    success: false,
                    error: `当前页面为 QQ ${pageQQ}，不是目标用户 ${message.targetUser}`
                });
                return true;
            }
        }

        sendResponse({ success: true, data });
    } else if (message.type === 'POP_TO_CONTENT_COLLECT') {
        const allFeeds = findAllFeedsQZone();
        if (allFeeds.length === 0) {
            sendResponse({ success: false, error: 'No feeds found' });
            return true;
        }

        const pageQQ = getPageQQ();
        const contents = allFeeds
            .map(f => collectFeedDataQZone(f))
            .filter(data => data.text && data.text.trim().length > 0);

        chrome.runtime.sendMessage({
            type: 'CONTENT_TO_BG_PROCESS',
            contents,
            pageUID: pageQQ
        }, response => {
            sendResponse(response);
        });
        return true;
    } else if (message.type === MessageTypeQZone.GET_PAGE_INFO) {
        sendResponse(getPageInfoQZone());
    }
    return true;
});

/**
 * Auto-collect on page load
 */
async function tryAutoCollectQZone(): Promise<void> {
    // 1. Check URL pattern first
    if (!isQZoneMainPage()) {
        return;
    }

    const pageQQ = getPageQQ();
    if (!pageQQ) {
        return;
    }

    // 2. Compare with config
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;
    const config = response.config;

    if (!config.targetQZoneUser || pageQQ !== config.targetQZoneUser) {
        console.log('[Synapse] QZone QQ mismatch, skipping auto-collect', { current: pageQQ, target: config.targetQZoneUser });
        return;
    }

    console.log(`[Synapse] QZone matched target user ${pageQQ}, preparing to parse DOM...`);

    // 3. Wait for content and parse DOM
    await new Promise(resolve => setTimeout(resolve, 5000)); // QZone is slow

    const feeds = findAllFeedsQZone();
    if (feeds.length === 0) {
        console.log('[Synapse] No feeds found on QZone page after waiting');
        return;
    }

    const contents = feeds
        .map(f => collectFeedDataQZone(f))
        .filter(data => data.text && data.text.trim().length > 0);

    chrome.runtime.sendMessage({
        type: 'CONTENT_TO_BG_PROCESS' as const,
        contents,
        pageUID: pageQQ,
        source: 'QZone' as const
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] QZone auto-collected ${response.collected} feeds`);
        }
    });
}

/**
 * Initialization logic
 */
(() => {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'qzone' });
    tryAutoCollectQZone();

    let lastUrl = window.location.href;
    let lastScrollTop = 0;
    let debounceTimer: number | undefined;

    const triggerCollect = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            tryAutoCollectQZone();
        }, 10000); // Wait 10 seconds
    };

    // 1. Listen for URL changes (immediate)
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            if (debounceTimer) clearTimeout(debounceTimer);
            tryAutoCollectQZone();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 2. Listen for scroll down events (debounced)
    window.addEventListener('scroll', () => {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > lastScrollTop) {
            // Scrolling down
            triggerCollect();
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });
})();
