/**
 * Bilibili Content Collector
 * Extracts dynamic/post content from Bilibili pages
 */


// Message types for communication with background script
const MessageTypeBilibili = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    COLLECT_RESULT: 'COLLECT_RESULT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
} as const;

/**
 * Detect the type of dynamic
 * @param {Element} dynamicElement
 * @returns {'text' | 'video' | 'article' | 'unknown'}
 */
function detectDynamicTypeBilibili(dynamicElement: Element): 'text' | 'video' | 'article' | 'unknown' {
    // Check for video dynamic (投稿了视频)
    if (dynamicElement.querySelector('.bili-dyn-card-video')) return 'video';

    // Check for article dynamic (专栏)
    if (dynamicElement.querySelector('.bili-dyn-card-article')) return 'article';

    // Check for pure text/image dynamic (Opus or standard)
    if (dynamicElement.querySelector('.dyn-card-opus, .bili-dyn-content__orig__desc, .bili-rich-text, .opus-module-content')) return 'text';

    // Fallback: If it has any text or images, it's likely a text dynamic
    const text = (dynamicElement as HTMLElement).innerText?.trim();
    if (text || dynamicElement.querySelector('img')) return 'text';

    return 'unknown';
}

/**
 * Extract text content from a dynamic element
 * Handles both text dynamics and video dynamics
 * @param {Element} dynamicElement
 * @returns {string}
 */
function extractDynamicTextBilibili(dynamicElement: Element): string {
    const dynamicType = detectDynamicTypeBilibili(dynamicElement);

    // For VIDEO dynamics: combine title + description
    if (dynamicType === 'video') {
        const titleElement = dynamicElement.querySelector('.bili-dyn-card-video__title');
        const descElement = dynamicElement.querySelector('.bili-dyn-card-video__desc');

        const title = (titleElement as HTMLElement)?.innerText?.trim() || '';
        const desc = (descElement as HTMLElement)?.innerText?.trim() || '';

        // Combine: [视频] Title\nDescription
        if (title && desc && desc !== '-') {
            return `[视频] ${title} \n${desc} `;
        } else if (title) {
            return `[视频] ${title} `;
        }
    }

    // For TEXT dynamics: try opus summary first (contains actual text in spans)
    const opusSummary = dynamicElement.querySelector('.dyn-card-opus__summary, .opus-module-content');
    if (opusSummary) {
        // Get all text content from nested elements
        return (opusSummary as HTMLElement).innerText.trim() || '';
    }

    // Fallback selectors
    const textSelectors = [
        '.bili-dyn-content__orig__desc',
        '.bili-rich-text',
        '.dyn-card-opus__summary'
    ];

    for (const selector of textSelectors) {
        const textElement = dynamicElement.querySelector(selector);
        if (textElement) {
            return (textElement as HTMLElement).innerText.trim() || '';
        }
    }

    return '';
}

/**
 * Extract images from a dynamic element
 * Handles both image dynamics and video thumbnails
 * @param {Element} dynamicElement
 * @returns {string[]}
 */
function extractDynamicImagesBilibili(dynamicElement: Element): string[] {
    const images: string[] = [];
    const dynamicType = detectDynamicTypeBilibili(dynamicElement);

    // For VIDEO dynamics: extract video cover/thumbnail
    if (dynamicType === 'video') {
        const coverSelectors = [
            '.bili-dyn-card-video__cover img',
            '.bili-dyn-card-video .cover img',
            '.bili-dyn-card-video__cover-img'
        ];

        for (const selector of coverSelectors) {
            const coverImg = dynamicElement.querySelector(selector) as HTMLImageElement;
            if (coverImg) {
                let src = coverImg.src || coverImg.getAttribute('data-src');
                if (src) {
                    src = src.replace(/@\d+w_\d+h.*/, '');
                    images.push(src);
                    break;
                }
            }
        }
    }

    // For IMAGE dynamics: find images in dynamic content
    const imageSelectors = [
        '.bili-dyn-content__orig__pics img',
        '.bili-album__preview__picture img',
        '.dyn-card-opus__pics img',
        '.opus-module-content img'
    ];

    for (const selector of imageSelectors) {
        const imgElements = dynamicElement.querySelectorAll(selector);
        imgElements.forEach(img => {
            const htmlImg = img as HTMLImageElement;
            let src = htmlImg.src || htmlImg.getAttribute('data-src');
            if (src) {
                // Get higher quality version
                src = src.replace(/@\d+w_\d+h.*/, '');
                images.push(src);
            }
        });
    }

    return [...new Set(images)]; // Remove duplicates
}

/**
 * Extract timestamp from a dynamic element
 * @param {Element} dynamicElement
 * @returns {string}
 */
function extractDynamicTimestampBilibili(dynamicElement: Element): string {
    // Try to find time element
    const timeSelectors = [
        '.bili-dyn-time',
        '.dyn-card-opus__head__time',
        '.bili-dyn-item__header__info__time',
        'time',
        '.time'
    ];

    for (const selector of timeSelectors) {
        const timeElement = dynamicElement.querySelector(selector);
        if (timeElement) {
            // Priority 1: Check title attribute (often has full date/time)
            const titleTime = timeElement.getAttribute('title');
            if (titleTime && titleTime.match(/\d{4}-\d{1,2}-\d{1,2}/)) {
                // Handle formats like "2024-12-30 14:00" or "2024/12/30 14:00"
                const date = new Date(titleTime.replace(/-/g, '/'));
                if (!isNaN(date.getTime())) return date.toISOString();
            }

            // Priority 2: Check datetime attribute (semantic standard)
            const dateTimeAttr = timeElement.getAttribute('datetime');
            if (dateTimeAttr) {
                const date = new Date(dateTimeAttr);
                if (!isNaN(date.getTime())) return date.toISOString();
            }

            // Priority 3: Parse the visible text
            const timeText = (timeElement as HTMLElement).innerText || timeElement.getAttribute('datetime');
            if (timeText) {
                return parseRelativeTimeBilibili(timeText);
            }
        }
    }

    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString();
}

/**
 * Parse relative time string to ISO format
 * @param {string} timeText
 * @returns {string}
 */
function parseRelativeTimeBilibili(timeText: string): string {
    const now = new Date();
    // Normalize to minute to ensure stable URLs for deduplication
    now.setSeconds(0, 0);

    // Handle "刚刚"
    if (timeText.includes('刚刚')) {
        return now.toISOString();
    }

    // Handle "X分钟前", "X小时前", "X天前"
    const minuteMatch = timeText.match(/(\d+)\s*分钟前/);
    if (minuteMatch) {
        now.setMinutes(now.getMinutes() - parseInt(minuteMatch[1]));
        return now.toISOString();
    }

    const hourMatch = timeText.match(/(\d+)\s*小时前/);
    if (hourMatch) {
        now.setHours(now.getHours() - parseInt(hourMatch[1]));
        return now.toISOString();
    }

    const dayMatch = timeText.match(/(\d+)\s*天前/);
    if (dayMatch) {
        now.setDate(now.getDate() - parseInt(dayMatch[1]));
        return now.toISOString();
    }

    // Handle "昨天"
    if (timeText.includes('昨天')) {
        const timePart = timeText.match(/\d{1,2}:\d{2}/);
        now.setDate(now.getDate() - 1);
        if (timePart) {
            const [h, m] = timePart[0].split(':');
            now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        return now.toISOString();
    }

    // Handle "前天"
    if (timeText.includes('前天')) {
        const timePart = timeText.match(/\d{1,2}:\d{2}/);
        now.setDate(now.getDate() - 2);
        if (timePart) {
            const [h, m] = timePart[0].split(':');
            now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        return now.toISOString();
    }

    // Handle date format like "2025年12月17日" or "12月17日"
    const cnDateMatch = timeText.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (cnDateMatch) {
        const year = parseInt(cnDateMatch[1]) || now.getFullYear();
        const month = parseInt(cnDateMatch[2]) - 1;
        const day = parseInt(cnDateMatch[3]);
        
        // Create Date as UTC+8 (Beijing Time)
        const date = new Date(Date.UTC(year, month, day, 0, 0));
        date.setUTCHours(date.getUTCHours() - 8);
        return date.toISOString();
    }

    // Handle date format like "01-05" or "2026-01-05"
    const dateMatch = timeText.match(/(?:(\d{2,4})-)?(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
        let yearStr = dateMatch[1] || now.getFullYear().toString();
        if (yearStr.length === 2) {
            yearStr = '20' + yearStr;
        }
        const year = parseInt(yearStr);
        const month = parseInt(dateMatch[2]) - 1;
        const day = parseInt(dateMatch[3]);
        
        // Create Date as UTC+8 (Beijing Time)
        const date = new Date(Date.UTC(year, month, day, 0, 0));
        date.setUTCHours(date.getUTCHours() - 8);
        return date.toISOString();
    }

    return now.toISOString();
}


/**
 * Extract dynamic URL
 * Handles both dynamic/opus URLs and video URLs
 * @param {Element} dynamicElement
 * @returns {string}
 */
function extractDynamicUrlBilibili(dynamicElement: Element): string {
    // 1. Try to find a direct video/opus link first
    const linkElement = dynamicElement.querySelector('a[href*="/video/"], a[href*="/opus/"]') as HTMLAnchorElement;
    if (linkElement && linkElement.href && !linkElement.href.includes('space.bilibili.com')) {
        return linkElement.href.split('?')[0];
    }

    // 2. Try to find dynamic ID from attributes
    const dynamicId = dynamicElement.getAttribute('data-id') ||
        dynamicElement.getAttribute('data-dynamic-id') ||
        dynamicElement.querySelector('[data-id]')?.getAttribute('data-id');

    if (dynamicId) {
        return `https://www.bilibili.com/opus/${dynamicId}`;
    }

    // 3. For text dynamics without ID, use Space URL + Text Highlight (#:~:text=...)
    const pageUID = getCurrentPageUID() || 'unknown';
    const text = extractDynamicTextBilibili(dynamicElement);
    const timestamp = extractDynamicTimestampBilibili(dynamicElement);

    // Use first 100 chars of text for highlight to keep URL reasonable
    const highlightText = text.substring(0, 100).trim();
    if (highlightText) {
        const encodedText = encodeURIComponent(highlightText);
        // Add timestamp-based salt to ensure uniqueness for same-text posts
        const salt = btoa(timestamp).substring(0, 8);
        return `https://space.bilibili.com/${pageUID}/dynamic#:~:text=${encodedText}&synapse=${salt}`;
    }

    return `https://space.bilibili.com/${pageUID}/dynamic#synapse-${Date.now()}`;
}

/**
 * Extract author info from a dynamic element
 * @param {Element} dynamicElement
 * @returns {{username: string, displayName: string}}
 */
function extractAuthorInfoBilibili(dynamicElement: Element): AuthorInfo {
    const nameSelectors = [
        '.bili-dyn-title__text',
        '.dyn-card-opus__head__name',
        '.user-name'
    ];

    for (const selector of nameSelectors) {
        const nameElement = dynamicElement.querySelector(selector);
        if (nameElement) {
            const name = (nameElement as HTMLElement).innerText.trim();
            return {
                username: name,
                displayName: name
            };
        }
    }

    return { username: '', displayName: '' };
}

/**
 * Collect data from a single dynamic element
 * @param {Element} dynamicElement
 * @returns {Object}
 */
export function collectDynamicDataBilibili(dynamicElement: Element): CollectedContent {
    const text = extractDynamicTextBilibili(dynamicElement);
    const images = extractDynamicImagesBilibili(dynamicElement);
    const timestamp = extractDynamicTimestampBilibili(dynamicElement);
    const url = extractDynamicUrlBilibili(dynamicElement);
    const author = extractAuthorInfoBilibili(dynamicElement);
    const type = detectDynamicTypeBilibili(dynamicElement);

    return {
        source: 'Bilibili' as const,
        type,
        text,
        images,
        videos: [], // Bilibili dynamics might contain videos, but currently not extracted as a separate array
        timestamp,
        url,
        author,
        collectedAt: new Date().toISOString()
    };
}

/**
 * Get the UID from current page URL
 * URL format: https://space.bilibili.com/{uid}/dynamic
 * @returns {string}
 */
function getCurrentPageUID(): string {
    const path = window.location.pathname;
    const match = path.match(/^\/(\d+)/);
    return match ? match[1] : '';
}

/**
 * Check if current page is a dynamic page
 * @returns {boolean}
 */
export function isDynamicPage(): boolean {
    return window.location.hostname === 't.bilibili.com' ||
        (window.location.hostname === 'space.bilibili.com' && window.location.pathname.includes('/dynamic')) ||
        (window.location.hostname === 'www.bilibili.com' && window.location.pathname.startsWith('/v/dynamic'));
}

/**
 * Find the main dynamic on the page
 * @returns {Element|null}
 */
function findMainDynamicBilibili(): Element | null {
    // Only collect from dynamic pages
    if (!isDynamicPage()) {
        return null;
    }

    // On space.bilibili.com/{uid}/dynamic page, find first dynamic item
    const mainSelectors = [
        '.bili-dyn-list__item',
        '.bili-dyn-item',
        '.dyn-card'
    ];

    for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element) return element;
    }

    return null;
}

/**
 * Find all visible dynamics on the page
 * Only selects top-level list items to avoid duplicates
 * @returns {Element[]}
 */
export function findAllDynamicsBilibili(): Element[] {
    if (!isDynamicPage()) {
        return [];
    }
    // Only select .bili-dyn-list__item (top-level), not nested .bili-dyn-item
    const items = document.querySelectorAll('.bili-dyn-list__item');
    if (items.length > 0) {
        return Array.from(items);
    }
    // Fallback for different page structures
    return Array.from(document.querySelectorAll('.bili-dyn-item:not(.bili-dyn-list__item .bili-dyn-item .bili-dyn-item)'));
}

/**
 * Collect the current/main dynamic on the page
 * @returns {Object|null}
 */
function collectCurrentDynamicBilibili(): CollectedContent | null {
    const mainDynamic = findMainDynamicBilibili();
    if (!mainDynamic) {
        return null;
    }
    return collectDynamicDataBilibili(mainDynamic);
}

/**
 * Get page info for the popup
 * @returns {Object}
 */
function getPageInfoBilibili(): PageInfo {
    const dynamics = findAllDynamicsBilibili();
    const mainDynamic = findMainDynamicBilibili();
    const pageUID = getCurrentPageUID();

    return {
        isBilibiliPage: true,
        isDynamicPage: isDynamicPage(),
        dynamicCount: dynamics.length,
        hasMainDynamic: mainDynamic !== null,
        currentUrl: window.location.href,
        pageUID: pageUID
    } as PageInfo;
}

(window as any).getPageInfoBilibili = getPageInfoBilibili;

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === MessageTypeBilibili.COLLECT_CURRENT) {
        // ...
        const mainDynamic = findMainDynamicBilibili();

        if (!mainDynamic) {
            sendResponse({ success: false, error: '未找到动态内容' });
            return true;
        }

        const data = collectDynamicDataBilibili(mainDynamic);
        // ...
        sendResponse({ success: true, data });
    } else if (message.type === 'MANUAL_COLLECT') {
        const pageUID = getCurrentPageUID();
        const allDynamics = findAllDynamicsBilibili();

        if (allDynamics.length === 0) {
            sendResponse({ success: false, error: 'No dynamics found on page' });
            return true;
        }

        const allContent = allDynamics.map(element => {
            const data = collectDynamicDataBilibili(element);
            data.author = { username: pageUID, displayName: pageUID };
            return data;
        });

        // Send to background for processing (bypassing interval)
        chrome.runtime.sendMessage({
            type: 'MANUAL_COLLECT_BATCH',
            contents: allContent,
            pageUID: pageUID
        }, response => {
            sendResponse(response);
        });
        return true; // Keep channel open for async response
    } else if (message.type === MessageTypeBilibili.GET_PAGE_INFO) {
        sendResponse(getPageInfoBilibili());
    }
    return true;
});

/**
 * Auto-collect ALL visible dynamics on page load
 */
async function tryAutoCollectBilibili(): Promise<void> {
    // Only auto-collect on dynamic pages
    if (!isDynamicPage()) {
        return;
    }

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    const allDynamics = findAllDynamicsBilibili();
    if (allDynamics.length === 0) {
        return;
    }

    // Collect all dynamic data
    const pageUID = getCurrentPageUID();
    const allContent = allDynamics.map((element, index) => {
        const data = collectDynamicDataBilibili(element);
        // Add UID as username for target user verification
        data.author = { username: pageUID, displayName: pageUID };

        return data;
    });

    // Send batch to background for processing
    chrome.runtime.sendMessage({
        type: 'AUTO_COLLECT_BATCH',
        contents: allContent,
        pageUID: pageUID
    }, response => {
        // Silent success/fail
    });
}

// Notify background script that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'bilibili' });

// Try auto-collect after page loads
tryAutoCollectBilibili();
