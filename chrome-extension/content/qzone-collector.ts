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
    const infoElement = item.querySelector('.f-info');
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
    const timeLink = (item.querySelector('.f-time a') || item.querySelector('.abritary')) as HTMLAnchorElement;
    if (timeLink && timeLink.href && !timeLink.href.startsWith('javascript:')) {
        return timeLink.href;
    }

    // Try to find a unique ID in the element itself
    const feedId = item.getAttribute('data-id') || item.id || item.getAttribute('name') || '';

    // Fallback: Use Parent/Current URL + Text Highlight (#:~:text=...)
    let baseUrl = window.location.href;
    try {
        if (window.parent && window.parent.location.hostname.includes('qzone.qq.com')) {
            baseUrl = window.parent.location.href;
        }
    } catch (e) { /* ignore cross-origin */ }

    // Clean up base URL
    baseUrl = baseUrl.split('#')[0].split('?')[0];

    // Use first 50 chars for the hash to ensure different posts with same "clock-in" text but different surrounding info stay unique
    const contentHash = btoa(unescape(encodeURIComponent(text.substring(0, 50)))).substring(0, 10);
    const timeHash = btoa(timestamp).substring(0, 8);

    // Combine for a super-stable but unique ID
    const salt = feedId ? `id-${feedId}` : `h-${contentHash}-${timeHash}`;

    const highlightText = text.substring(0, 100).trim();
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
export function collectFeedDataQZone(item: Element): CollectedContent {
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
export function findAllFeedsQZone(): Element[] {
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
 * Get the current page's QQ number from URL
 */
function getPageQQ(): string {
    const match = window.location.href.match(/qzone\.qq\.com\/(\d+)/);
    if (match) return match[1];

    if (window.parent && window.parent.location.href) {
        const parentMatch = window.parent.location.href.match(/qzone\.qq\.com\/(\d+)/);
        if (parentMatch) return parentMatch[1];
    }

    return '';
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

(window as any).getPageInfoQZone = getPageInfoQZone;

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
    } else if (message.type === 'MANUAL_COLLECT') {
        const allFeeds = findAllFeedsQZone();
        if (allFeeds.length === 0) {
            sendResponse({ success: false, error: 'No feeds found' });
            return true;
        }

        const pageQQ = getPageQQ();
        const contents = allFeeds.map(f => collectFeedDataQZone(f));

        chrome.runtime.sendMessage({
            type: 'MANUAL_COLLECT_BATCH',
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
 * Auto-collect visibility changes
 */
async function tryAutoCollectQZone(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const feeds = findAllFeedsQZone();
    if (feeds.length === 0) return;

    const pageQQ = getPageQQ();
    const contents = feeds.map(f => collectFeedDataQZone(f));

    chrome.runtime.sendMessage({
        type: 'AUTO_COLLECT_BATCH' as const,
        contents,
        pageUID: pageQQ,
        source: 'QZone' as const
    }, _response => {
        // Silent
    });
}

chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'qzone' });

if (document.getElementById('host_home_feeds')) {
    tryAutoCollectQZone();
} else {
    const observer = new MutationObserver((_mutations, obs) => {
        if (document.getElementById('host_home_feeds')) {
            tryAutoCollectQZone();
            obs.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
