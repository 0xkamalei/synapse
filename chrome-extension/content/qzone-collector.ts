/**
 * QZone Content Collector
 * Extracts feed content from QQ Zone pages
 */

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

    // Handle relative: "X hours ago", "X minutes ago"
    const hourMatch = timeText.match(/(\d+)\s*(?:小时前|hours ago)/);
    if (hourMatch) {
        now.setHours(now.getHours() - parseInt(hourMatch[1]));
        return now.toISOString();
    }
    const minuteMatch = timeText.match(/(\d+)\s*(?:分钟前|minutes ago)/);
    if (minuteMatch) {
        now.setMinutes(now.getMinutes() - parseInt(minuteMatch[1]));
        return now.toISOString();
    }

    // Handle: "Yesterday 12:34"
    if (timeText.includes('昨天') || timeText.toLowerCase().includes('yesterday')) {
        const timePart = timeText.match(/\d{1,2}:\d{2}/);
        now.setDate(now.getDate() - 1);
        if (timePart) {
            const [h, m] = timePart[0].split(':');
            now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        return now.toISOString();
    }

    // Handle: "Day before yesterday 12:34"
    if (timeText.includes('前天') || timeText.toLowerCase().includes('day before yesterday')) {
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

    // Handle absolute: "2025年8月23日 11:58" or "8月23日 11:58"
    const cnDateMatch = timeText.match(/(?:(\d{4})(?:年|[-/]))?\s*(\d{1,2})(?:月|[-/])\s*(\d{1,2})(?:日|)?\s+(\d{1,2}):(\d{2})/);
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
        links: [],
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
        '#host_home_feeds li.f-single', // Most specific
        '#host_home_feeds li',          // Your identified container
        'li.f-single',                  // General QZone feed item
        'li[id^="fct_"]',               // ID based items
        '.feed_item',
        'div[id^="feed_"]',
        'div[id^="f_"]'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`[Synapse] Found ${elements.length} feeds in frame ${window.location.pathname} using selector: ${selector}`);
            return Array.from(elements);
        }
    }

    // If we are in the top frame, we still might want to check iframes 
    // BUT only as a fallback if the script inside those iframes isn't doing its job.
    // However, to keep it simple and prevent duplicates, we'll rely on the frame-specific script injection.

    return [];
}

/**
 * Check if current page is a valid QZone page (main page or feed iframe)
 */
function isQZonePage(targetQQ: string): boolean {
    const url = window.location.href;

    // 1. Check for the feed iframe URL and matching targetQQ
    if (!url.includes('cgi-bin/feeds/feeds_html_module')) {
        return false;
    }

    // Also verify the QQ number in the iframe URL
    const urlObj = new URL(url);
    const uin = urlObj.searchParams.get('uin') || urlObj.searchParams.get('ownerUin');
    if (uin && uin !== targetQQ) {
        return false;
    }

    // 2. Strict check for parent window URL
    try {
        if (window.parent && window.parent !== window) {
            const parentUrl = window.parent.location.href;
            return parentUrl.includes(`user.qzone.qq.com/${targetQQ}/main`);
        }
    } catch (e) {
        // If cross-origin prevents access, trust the specific iframe URL + QQ check
        return true;
    }

    return false;
}

/**
 * Get the QQ number from current page
 */
function getPageQQ(): string {
    const url = window.location.href;

    // 1. From URL path (main page)
    const match = url.match(/user\.qzone\.qq\.com\/(\d+)/);
    if (match) return match[1];

    // 2. From URL parameters (iframe)
    const urlObj = new URL(url);
    const uin = urlObj.searchParams.get('uin') || urlObj.searchParams.get('ownerUin');
    if (uin && /^\d+$/.test(uin)) return uin;

    // 3. From global variables (if accessible)
    try {
        const win = window as any;
        if (win.g_iUin) return win.g_iUin.toString();

        // Try parent if it's a same-origin frame
        if (win.parent) {
            try {
                if (win.parent.g_iUin) return win.parent.g_iUin.toString();
                const parentUrl = win.parent.location.href;
                const pMatch = parentUrl.match(/user\.qzone\.qq\.com\/(\d+)/);
                if (pMatch) return pMatch[1];
            } catch (pe) { /* cross-origin parent */ }
        }
    } catch (e) { /* ignore cross-origin */ }

    // 4. Try to find from script contents
    const scripts = document.querySelectorAll('script');
    for (const script of Array.from(scripts)) {
        const content = script.textContent || '';
        const uinMatch = content.match(/g_iUin\s*=\s*["']?(\d+)["']?/) ||
            content.match(/ownerUin\s*[:=]\s*["']?(\d+)["']?/);
        if (uinMatch) return uinMatch[1];
    }

    return '';
}

/**
 * Get page info for the popup
 */
async function getPageInfoQZone(): Promise<PageInfo> {
    const feeds = findAllFeedsQZone();
    const pageQQ = getPageQQ();

    // Get config to check if this is the target page
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    const targetQQ = response?.config?.targetQZoneUser;
    const isMatched = targetQQ ? isQZonePage(targetQQ) : false;

    return {
        isTargetPage: isMatched,
        itemCount: feeds.length,
        currentUrl: window.location.href,
        pageIdentifier: pageQQ
    };
}


// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message.type === 'POP_TO_CONTENT_COLLECT') {
        const allFeeds = findAllFeedsQZone();
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
    } else if (message.type === 'GET_PAGE_INFO') {
        getPageInfoQZone().then(info => sendResponse(info));
        return true;
    }
    return true;
});

/**
 * Check if the current URL is the target user's profile page
 */
function isTargetURLQZone(targetQQ: string): boolean {
    if (!targetQQ) return false;
    return isQZonePage(targetQQ);
}

/**
 * Auto-collect on page load
 */
async function tryAutoCollectQZone(): Promise<void> {
    // 0. Get config and check if target user is configured
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) {
        console.log('[Synapse] Could not get config for QZone auto-collect');
        return;
    }
    const config = response.config;

    if (!config.targetQZoneUser) {
        console.log('[Synapse] Target QZone user not configured, skipping auto-collect');
        return;
    }

    // 1. isTargetURL check
    if (!isTargetURLQZone(config.targetQZoneUser)) {
        return;
    }

    if (!config.enabledSources?.includes('qzone')) {
        return;
    }

    // 2. Check interval
    const interval = config.collectIntervalHours ?? 4;
    const lastCollectForSource = config.lastCollectTimes?.qzone;
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;
    const now = Date.now();

    if (interval > 0 && lastCollect > 0) {
        const hoursSinceLast = (now - lastCollect) / (1000 * 60 * 60);
        if (hoursSinceLast < interval) {
            console.log(`[Synapse] Skipping auto-collect for QZone: last collect was ${hoursSinceLast.toFixed(2)} hours ago (interval: ${interval}h)`);
            return;
        }
    }

    console.log(`[Synapse] QZone auto-collect started for frame ${window.location.hostname}${window.location.pathname}`);

    // 3. Get page elements (Wait for both QQ and feeds using polling, max 15 seconds)
    let feeds: Element[] = [];
    let pageQQ = '';

    for (let i = 0; i < 30; i++) { // 30 * 500ms = 15s
        pageQQ = getPageQQ();
        feeds = findAllFeedsQZone();

        if (pageQQ && feeds.length > 0) {
            console.log(`[Synapse] Found QQ ${pageQQ} and ${feeds.length} feeds after ${i * 0.5}s`);
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!pageQQ) {
        console.log('[Synapse] Could not identify QZone QQ after waiting');
        return;
    }

    if (pageQQ !== config.targetQZoneUser) {
        console.log('[Synapse] QZone QQ mismatch, skipping auto-collect', { current: pageQQ, target: config.targetQZoneUser });
        return;
    }

    if (feeds.length === 0) {
        console.log('[Synapse] No feeds found on QZone page after waiting');
        return;
    }

    console.log(`[Synapse] QZone matched target user ${pageQQ}, auto-collecting ${feeds.length} feeds...`);

    // 4. Parse content
    const contents = feeds
        .map(f => collectFeedDataQZone(f))
        .filter(data => data.text && data.text.trim().length > 0);

    if (contents.length === 0) {
        console.log('[Synapse] No valid feed content found after parsing');
        return;
    }

    // 5. Send to background for saving
    chrome.runtime.sendMessage({
        type: 'CONTENT_TO_BG_PROCESS' as const,
        contents,
        pageUID: pageQQ,
        source: 'QZone' as const
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] QZone auto-collected ${response.collected} feeds from frame ${window.location.pathname}`);
        } else {
            console.error('[Synapse] QZone auto-collect failed in background:', response?.error);
        }
    });
}

chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'qzone' });
tryAutoCollectQZone();
