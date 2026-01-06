/**
 * Bilibili Content Collector
 * Extracts dynamic/post content from Bilibili pages
 */

// Message types for communication with background script
const MessageType = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    COLLECT_RESULT: 'COLLECT_RESULT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
};

/**
 * Detect the type of dynamic
 * @param {Element} dynamicElement
 * @returns {'text' | 'video' | 'article' | 'unknown'}
 */
function detectDynamicType(dynamicElement) {
    // Check for video dynamic (投稿了视频)
    if (dynamicElement.querySelector('.bili-dyn-card-video')) return 'video';

    // Check for article dynamic (专栏)
    if (dynamicElement.querySelector('.bili-dyn-card-article')) return 'article';

    // Check for pure text/image dynamic (Opus or standard)
    if (dynamicElement.querySelector('.dyn-card-opus, .bili-dyn-content__orig__desc, .bili-rich-text, .opus-module-content')) return 'text';

    // Fallback: If it has any text or images, it's likely a text dynamic
    if (dynamicElement.innerText?.trim() || dynamicElement.querySelector('img')) return 'text';

    return 'unknown';
}

/**
 * Extract text content from a dynamic element
 * Handles both text dynamics and video dynamics
 * @param {Element} dynamicElement
 * @returns {string}
 */
function extractDynamicText(dynamicElement) {
    const dynamicType = detectDynamicType(dynamicElement);

    // For VIDEO dynamics: combine title + description
    if (dynamicType === 'video') {
        const titleElement = dynamicElement.querySelector('.bili-dyn-card-video__title');
        const descElement = dynamicElement.querySelector('.bili-dyn-card-video__desc');

        const title = titleElement?.innerText?.trim() || '';
        const desc = descElement?.innerText?.trim() || '';

        // Combine: [视频] Title\nDescription
        if (title && desc && desc !== '-') {
            return `[视频] ${title}\n${desc}`;
        } else if (title) {
            return `[视频] ${title}`;
        }
    }

    // For TEXT dynamics: try opus summary first (contains actual text in spans)
    const opusSummary = dynamicElement.querySelector('.dyn-card-opus__summary, .opus-module-content');
    if (opusSummary) {
        // Get all text content from nested elements
        return opusSummary.innerText.trim() || '';
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
            return textElement.innerText.trim() || '';
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
function extractDynamicImages(dynamicElement) {
    const images = [];
    const dynamicType = detectDynamicType(dynamicElement);

    // For VIDEO dynamics: extract video cover/thumbnail
    if (dynamicType === 'video') {
        const coverSelectors = [
            '.bili-dyn-card-video__cover img',
            '.bili-dyn-card-video .cover img',
            '.bili-dyn-card-video__cover-img'
        ];

        for (const selector of coverSelectors) {
            const coverImg = dynamicElement.querySelector(selector);
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
            let src = img.src || img.getAttribute('data-src');
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
function extractDynamicTimestamp(dynamicElement) {
    // Try to find time element
    const timeSelectors = [
        '.bili-dyn-time',
        '.dyn-card-opus__head__time',
        'time'
    ];

    for (const selector of timeSelectors) {
        const timeElement = dynamicElement.querySelector(selector);
        if (timeElement) {
            const timeText = timeElement.innerText || timeElement.getAttribute('datetime');
            if (timeText) {
                // Try to parse relative time like "2小时前"
                return parseRelativeTime(timeText);
            }
        }
    }

    return new Date().toISOString();
}

/**
 * Parse relative time string to ISO format
 * @param {string} timeText
 * @returns {string}
 */
function parseRelativeTime(timeText) {
    const now = new Date();

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
        now.setDate(now.getDate() - 1);
        return now.toISOString();
    }

    // Handle date format like "2025年12月17日" or "12月17日"
    const cnDateMatch = timeText.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (cnDateMatch) {
        let year = cnDateMatch[1] || now.getFullYear();
        let month = parseInt(cnDateMatch[2]) - 1;
        let day = parseInt(cnDateMatch[3]);
        return new Date(year, month, day).toISOString();
    }

    // Handle date format like "01-05" or "2026-01-05"
    const dateMatch = timeText.match(/(?:(\d{2,4})-)?(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
        let year = dateMatch[1] || now.getFullYear().toString();
        if (year.length === 2) {
            year = '20' + year;
        }
        return new Date(`${year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`).toISOString();
    }

    return now.toISOString();
}

/**
 * Simple hash function for content
 * @param {string} str
 * @returns {string}
 */
function generateContentHash(str) {
    if (!str) return 'empty';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Extract dynamic URL
 * Handles both dynamic/opus URLs and video URLs
 * @param {Element} dynamicElement
 * @returns {string}
 */
function extractDynamicUrl(dynamicElement) {
    const dynamicType = detectDynamicType(dynamicElement);

    // For VIDEO dynamics: find the video link
    if (dynamicType === 'video') {
        const videoLink = dynamicElement.querySelector('a[href*="/video/"]');
        if (videoLink && videoLink.href) {
            // Clean up URL: remove query params
            return videoLink.href.split('?')[0];
        }
    }

    // Try to find dynamic/opus permalink (timestamp link is best)
    const timeElement = dynamicElement.querySelector('.bili-dyn-time, .dyn-card-opus__head__time, time');
    if (timeElement) {
        const linkElement = timeElement.closest('a');
        if (linkElement && linkElement.href && !linkElement.href.includes('space.bilibili.com')) {
            return linkElement.href.split('?')[0];
        }
    }

    // Try other specific link selectors
    const linkSelectors = [
        'a[href*="/opus/"]',
        'a[href*="/dynamic/"]',
        '.bili-dyn-item__main a[href*="/opus/"]',
        '.bili-dyn-item__main a[href*="/video/"]'
    ];

    for (const selector of linkSelectors) {
        const linkElement = dynamicElement.querySelector(selector);
        if (linkElement && linkElement.href) {
            return linkElement.href.split('?')[0];
        }
    }

    // Use data-id if available
    const dynamicId = dynamicElement.getAttribute('data-id') ||
        dynamicElement.getAttribute('data-dynamic-id') ||
        dynamicElement.querySelector('[data-id]')?.getAttribute('data-id');

    if (dynamicId) {
        return `https://www.bilibili.com/opus/${dynamicId}`;
    }

    // Fallback: Use the user's space dynamic page instead of a non-existent opus URL
    const pageUID = getCurrentPageUID();
    if (pageUID) {
        return `https://space.bilibili.com/${pageUID}/dynamic`;
    }

    return `${window.location.href}#dyn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Extract author info from a dynamic element
 * @param {Element} dynamicElement
 * @returns {{username: string, displayName: string}}
 */
function extractAuthorInfo(dynamicElement) {
    const nameSelectors = [
        '.bili-dyn-title__text',
        '.dyn-card-opus__head__name',
        '.user-name'
    ];

    for (const selector of nameSelectors) {
        const nameElement = dynamicElement.querySelector(selector);
        if (nameElement) {
            return {
                username: nameElement.innerText.trim(),
                displayName: nameElement.innerText.trim()
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
function collectDynamicData(dynamicElement) {
    const text = extractDynamicText(dynamicElement);
    const images = extractDynamicImages(dynamicElement);
    const timestamp = extractDynamicTimestamp(dynamicElement);
    const url = extractDynamicUrl(dynamicElement);
    const author = extractAuthorInfo(dynamicElement);
    const type = detectDynamicType(dynamicElement);

    return {
        source: 'Bilibili',
        type,
        text,
        images,
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
function getCurrentPageUID() {
    const path = window.location.pathname;
    const match = path.match(/^\/(\d+)/);
    return match ? match[1] : '';
}

/**
 * Check if current page is a dynamic page
 * @returns {boolean}
 */
function isDynamicPage() {
    // Must be on space.bilibili.com/{uid}/dynamic
    return window.location.hostname === 'space.bilibili.com' &&
        window.location.pathname.includes('/dynamic');
}

/**
 * Find the main dynamic on the page
 * @returns {Element|null}
 */
function findMainDynamic() {
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
function findAllDynamics() {
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
function collectCurrentDynamic() {
    const mainDynamic = findMainDynamic();
    if (!mainDynamic) {
        return null;
    }
    return collectDynamicData(mainDynamic);
}

/**
 * Get page info for the popup
 * @returns {Object}
 */
function getPageInfo() {
    const dynamics = findAllDynamics();
    const mainDynamic = findMainDynamic();
    const pageUID = getCurrentPageUID();

    return {
        isBilibiliPage: true,
        isDynamicPage: isDynamicPage(),
        dynamicCount: dynamics.length,
        hasMainDynamic: mainDynamic !== null,
        currentUrl: window.location.href,
        pageUID: pageUID
    };
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MessageType.COLLECT_CURRENT) {
        // Check if on dynamic page
        if (!isDynamicPage()) {
            sendResponse({
                success: false,
                error: '请进入用户动态页面采集 (space.bilibili.com/{uid}/dynamic)'
            });
            return true;
        }

        const mainDynamic = findMainDynamic();

        if (!mainDynamic) {
            sendResponse({ success: false, error: '未找到动态内容' });
            return true;
        }

        const data = collectDynamicData(mainDynamic);

        // Check if we have a target UID to filter
        if (message.targetUser) {
            const pageUID = getCurrentPageUID();

            if (pageUID !== message.targetUser) {
                sendResponse({
                    success: false,
                    error: `当前页面为 UID ${pageUID}，不是目标用户 ${message.targetUser}`
                });
                return true;
            }
        }

        sendResponse({ success: true, data });
    } else if (message.type === 'MANUAL_COLLECT') {
        const pageUID = getCurrentPageUID();
        const allDynamics = findAllDynamics();

        if (allDynamics.length === 0) {
            sendResponse({ success: false, error: 'No dynamics found on page' });
            return true;
        }

        const allContent = allDynamics.map(element => {
            const data = collectDynamicData(element);
            data.author = { username: pageUID };
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
    } else if (message.type === MessageType.GET_PAGE_INFO) {
        sendResponse(getPageInfo());
    }
    return true;
});

/**
 * Auto-collect ALL visible dynamics on page load
 */
async function tryAutoCollect() {
    // Only auto-collect on dynamic pages
    if (!isDynamicPage()) {
        return;
    }

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    const allDynamics = findAllDynamics();
    if (allDynamics.length === 0) {
        console.log('[Synapse] No dynamics found for auto-collect');
        return;
    }

    console.log(`[Synapse] Found ${allDynamics.length} dynamics to collect`);

    // Collect all dynamic data
    const pageUID = getCurrentPageUID();
    const allContent = allDynamics.map((element, index) => {
        const data = collectDynamicData(element);
        // Add UID as username for target user verification
        data.author = { username: pageUID };

        // Debug: Log each parsed dynamic
        console.log(`[Synapse DEBUG] Dynamic ${index + 1}/${allDynamics.length}:`, JSON.stringify({
            type: detectDynamicType(element),
            text: data.text?.substring(0, 100) + (data.text?.length > 100 ? '...' : ''),
            images: data.images?.length || 0,
            url: data.url,
            timestamp: data.timestamp
        }, null, 2));

        return data;
    });

    // Send batch to background for processing
    chrome.runtime.sendMessage({
        type: 'AUTO_COLLECT_BATCH',
        contents: allContent,
        pageUID: pageUID
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] Auto-collected ${response.collected || 0} dynamics successfully`);
        } else if (response?.reason === 'interval') {
            console.log('[Synapse] Skipped - collection interval not reached');
        } else if (response?.reason === 'not_target_user') {
            console.log('[Synapse] Skipped - not target user');
        } else if (response?.error) {
            console.log('[Synapse] Auto-collect failed:', response.error);
        }
    });
}

// Notify background script that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'bilibili' });

// Try auto-collect after page loads
tryAutoCollect();

console.log('[Synapse] Bilibili collector loaded');
