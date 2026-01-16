/**
 * Weibo Content Collector
 * Extracts posts from Weibo pages
 */

/**
 * Extract embedded links from Weibo post text
 * Weibo encodes links as URL parameters in href: https://weibo.cn/sinaurl?u=[encoded-url]
 */
function extractWeiboEmbeddedLinks(postElement: Element): string[] {
    const links: string[] = [];

    // Find all links in the content area
    const contentElement = postElement.querySelector('.wbpro-feed-content ._wbtext_1psp9_14');
    if (!contentElement) {
        return links;
    }

    // Find all <a> tags with the weibo.cn/sinaurl pattern
    const anchors = contentElement.querySelectorAll('a[href*="weibo.cn/sinaurl"]');
    anchors.forEach(anchor => {
        const href = anchor.getAttribute('href') || '';
        // Extract the URL parameter: https://weibo.cn/sinaurl?u=https%3A%2F%2Fexample.com
        const match = href.match(/[?&]u=([^&]+)/);
        if (match && match[1]) {
            try {
                // Decode the URL-encoded parameter
                const decodedUrl = decodeURIComponent(match[1]);
                if (!links.includes(decodedUrl) && decodedUrl.startsWith('http')) {
                    links.push(decodedUrl);
                }
            } catch (e) {
                // If decoding fails, skip this link
            }
        }
    });

    return links;
}

/**
 * Extract text content from a Weibo post element
 * Replaces "网页链接" placeholders with actual extracted URLs
 */
function extractWeiboText(postElement: Element): string {
    // Try to find text in the main content area
    const textElement = postElement.querySelector('.wbpro-feed-content .wbpro-feed-ogText, .wbpro-feed-content ._wbtext_1psp9_14');
    let text = '';

    if (textElement) {
        text = (textElement as HTMLElement).innerText?.trim() || '';
    } else {
        // Fallback: look for any text content in the feed content
        const contentElement = postElement.querySelector('.wbpro-feed-content');
        if (contentElement) {
            text = (contentElement as HTMLElement).innerText?.trim() || '';
        }
    }

    // Extract embedded links and replace "网页链接" with actual URLs
    const embeddedLinks = extractWeiboEmbeddedLinks(postElement);
    if (embeddedLinks.length > 0) {
        // Replace each "网页链接" occurrence with the corresponding real link
        embeddedLinks.forEach(link => {
            text = text.replace('网页链接', link);
        });
    }

    return text;
}

/**
 * Extract images from a Weibo post element
 */
function extractWeiboImages(postElement: Element): string[] {
    const images: string[] = [];

    // Find the image gallery container within the post
    const imageGallery = postElement.querySelector('[class*="woo-picture"], [class*="feed-images"]');
    if (!imageGallery) {
        return images;
    }

    // Find all image elements specifically in the gallery
    const imgElements = imageGallery.querySelectorAll('img');
    imgElements.forEach(img => {
        const htmlImg = img as HTMLImageElement;
        let src = htmlImg.src;

        // Skip avatar/profile pictures and small icons (typically < 200x200)
        if (src && !src.includes('loading.gif') && !src.startsWith('data:')) {
            // Skip common avatar sizes
            if (src.includes('tvax') || src.includes('avatar') || src.includes('crop.0.0.')) {
                return;
            }

            // Skip small images (likely thumbnails or icons)
            if (src.includes('128x128') || src.includes('50x50')) {
                return;
            }

            // Remove query parameters for consistency
            src = src.split('?')[0];
            if (!images.includes(src)) {
                images.push(src);
            }
        }
    });

    return images;
}

/**
 * Extract videos from a Weibo post element
 */
function extractWeiboVideos(postElement: Element): string[] {
    const videos: string[] = [];

    // Look for video player elements
    const videoElements = postElement.querySelectorAll('video');
    videoElements.forEach(video => {
        const src = video.src || video.querySelector('source')?.getAttribute('src');
        if (src && !videos.includes(src)) {
            videos.push(src);
        }
    });

    return videos;
}

/**
 * Extract author information from a Weibo post
 */
function extractWeiboAuthor(postElement: Element): { username: string; displayName: string } {
    // Find author name in the header
    const nameElement = postElement.querySelector('header ._name_1b05f_122, header .woo-box-flex a[href*="/u/"]');
    const displayName = nameElement ? (nameElement as HTMLElement).innerText?.trim() || '' : '';

    // Extract username from the link href
    let username = '';
    const linkElement = postElement.querySelector('header a[href*="/u/"]');
    if (linkElement) {
        const href = linkElement.getAttribute('href') || '';
        const match = href.match(/\/u\/(\d+)/);
        if (match) {
            username = match[1];
        }
    }

    return {
        username: username || displayName,
        displayName: displayName
    };
}

/**
 * Extract timestamp from a Weibo post
 */
function extractWeiboTimestamp(postElement: Element): string {
    // Look for time element with title attribute
    const timeElement = postElement.querySelector('header a._time_1tpft_33');
    if (timeElement) {
        const titleAttr = timeElement.getAttribute('title');
        if (titleAttr && titleAttr.match(/\d{4}-\d{1,2}-\d{1,2}/)) {
            const date = new Date(titleAttr.replace(/-/g, '/'));
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
        }

        // Parse relative time like "刚刚", "6分钟前"
        const timeText = (timeElement as HTMLElement).innerText?.trim() || '';
        return parseWeiboTime(timeText);
    }

    // Fallback to current time
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString();
}

/**
 * Parse Weibo time string to ISO format
 */
function parseWeiboTime(timeText: string): string {
    const now = new Date();
    now.setSeconds(0, 0);

    timeText = timeText.trim().toLowerCase();

    // Handle "刚刚" (just now)
    if (timeText.includes('刚刚') || timeText.includes('just now')) {
        return now.toISOString();
    }

    // Handle "X分钟前" (X minutes ago)
    const minuteMatch = timeText.match(/(\d+)\s*(?:分钟前|minutes ago|m)/);
    if (minuteMatch) {
        now.setMinutes(now.getMinutes() - parseInt(minuteMatch[1]));
        return now.toISOString();
    }

    // Handle "X小时前" (X hours ago)
    const hourMatch = timeText.match(/(\d+)\s*(?:小时前|hours ago|h)/);
    if (hourMatch) {
        now.setHours(now.getHours() - parseInt(hourMatch[1]));
        return now.toISOString();
    }

    // Handle "昨天" (yesterday)
    if (timeText.includes('昨天') || timeText.includes('yesterday')) {
        now.setDate(now.getDate() - 1);
        // Extract time if available
        const timePart = timeText.match(/(\d{1,2}):(\d{2})/);
        if (timePart) {
            now.setHours(parseInt(timePart[1]), parseInt(timePart[2]), 0, 0);
        }
        return now.toISOString();
    }

    return now.toISOString();
}

/**
 * Extract URL from a Weibo post
 */
function extractWeiboUrl(postElement: Element): string {
    // Look for the post's permalink
    const linkElement = postElement.querySelector('header a._time_1tpft_33');
    if (linkElement) {
        let href = linkElement.getAttribute('href');
        if (href) {
            // Remove any leading slashes and ensure no double protocol
            href = href.replace(/^\/+/, '');
            if (!href.startsWith('http')) {
                href = 'https://weibo.com/' + href;
            }
            return href;
        }
    }

    // Fallback to current page URL
    return window.location.href;
}

/**
 * Find all Weibo posts on the current page
 */
function findAllPostsWeibo(): Element[] {
    // Weibo posts are in article elements with specific classes
    const posts = document.querySelectorAll('article.woo-panel-main[tabindex="0"]');
    return Array.from(posts).filter(post => {
        // Ensure it's an actual post with content
        const content = post.querySelector('.wbpro-feed-content');
        return content !== null;
    });
}

/**
 * Collect data from a single Weibo post
 */
function collectPostDataWeibo(postElement: Element): CollectedContent {
    const text = extractWeiboText(postElement);
    const images = extractWeiboImages(postElement);
    const videos = extractWeiboVideos(postElement);
    const links = extractWeiboEmbeddedLinks(postElement);
    const author = extractWeiboAuthor(postElement);
    const timestamp = extractWeiboTimestamp(postElement);
    const url = extractWeiboUrl(postElement);

    // Determine content type
    let type: ContentType = 'text';
    if (videos.length > 0) {
        type = 'video';
    } else if (images.length > 0) {
        type = 'image';
    }

    return {
        source: 'Weibo',
        type,
        text,
        images,
        videos,
        links,
        timestamp,
        url,
        author,
        collectedAt: new Date().toISOString()
    };
}

/**
 * Get current page's user ID from URL
 * Weibo profile URL: weibo.com/u/[UID] or weibo.com/[UID]
 */
function getCurrentPageUIDWeibo(): string {
    const urlMatch = window.location.href.match(/weibo\.com\/(?:u\/)?(\d+)/);
    return urlMatch ? urlMatch[1] : '';
}

/**
 * Check if current page is a Weibo profile page
 */
function isWeiboProfilePage(): boolean {
    return window.location.hostname.includes('weibo.com') &&
        (window.location.pathname.includes('/u/') || /\/\d+/.test(window.location.pathname));
}

/**
 * Check if current page is the target user's profile
 */
function isTargetURLWeibo(targetUID: string): boolean {
    if (!targetUID) return false;

    const pageUID = getCurrentPageUIDWeibo();
    const isProfilePage = isWeiboProfilePage();

    return isProfilePage && pageUID === targetUID;
}

/**
 * Get page info for the popup
 */
async function getPageInfoWeibo(): Promise<PageInfo> {
    const posts = findAllPostsWeibo();
    const pageUID = getCurrentPageUIDWeibo();

    // Get config to check if this is the target page
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    const targetUID = response?.config?.targetWeiboUser;
    const isMatched = (targetUID && pageUID === targetUID) || false;

    return {
        isTargetPage: isMatched,
        itemCount: posts.length,
        currentUrl: window.location.href,
        pageIdentifier: pageUID,
        // Additional platform-specific data
        isProfilePage: isWeiboProfilePage()
    };
}

/**
 * Auto-collect ALL visible posts on page load
 */
async function tryAutoCollectWeibo(): Promise<void> {
    // 0. Get config and check if target user is configured
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;
    const config = response.config;

    if (!config.targetWeiboUser) {
        console.log('[Synapse] Target Weibo user not configured, skipping auto-collect');
        return;
    }

    // 1. isTargetURL check
    if (!isTargetURLWeibo(config.targetWeiboUser)) {
        return;
    }

    // 2. Check interval
    const interval = config.collectIntervalHours ?? 4;
    const lastCollectForSource = config.lastCollectTimes?.weibo;
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;
    const now = Date.now();

    if (interval > 0 && lastCollect > 0) {
        const hoursSinceLast = (now - lastCollect) / (1000 * 60 * 60);
        if (hoursSinceLast < interval) {
            console.log(`[Synapse] Skipping auto-collect for Weibo: last collect was ${hoursSinceLast.toFixed(2)} hours ago (interval: ${interval}h)`);
            return;
        }
    }

    // 3. Get page elements
    await new Promise(resolve => setTimeout(resolve, 2000));
    const allPosts = findAllPostsWeibo();

    if (allPosts.length === 0) {
        console.log('[Synapse] No posts found to collect');
        return;
    }

    const pageUID = getCurrentPageUIDWeibo();

    // 4. Parse content
    const allContent = allPosts.map((element) => {
        const data = collectPostDataWeibo(element);
        // Add UID as username for target user verification
        data.author = { username: pageUID, displayName: pageUID };
        return data;
    }).filter(data => data.text && data.text.trim().length > 0);

    // 5. Send to background for saving
    chrome.runtime.sendMessage({
        type: 'CONTENT_TO_BG_PROCESS',
        contents: allContent,
        pageUID: pageUID
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] Weibo auto-collected ${response.collected} items`);
        }
    });
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'POP_TO_CONTENT_COLLECT') {
        const pageUID = getCurrentPageUIDWeibo();
        const allPosts = findAllPostsWeibo();

        if (allPosts.length === 0) {
            sendResponse({ success: false, error: 'No posts found on page' });
            return true;
        }

        const allContent = allPosts.map(element => {
            const data = collectPostDataWeibo(element);
            data.author = { username: pageUID, displayName: pageUID };
            return data;
        }).filter(data => data.text && data.text.trim().length > 0);

        // Send to background for processing
        chrome.runtime.sendMessage({
            type: 'CONTENT_TO_BG_PROCESS',
            contents: allContent,
            pageUID: pageUID
        }, response => {
            sendResponse(response);
        });
        return true;
    } else if (message.type === 'GET_PAGE_INFO') {
        getPageInfoWeibo().then(info => sendResponse(info));
        return true;
    }
    return true;
});

/**
 * Initialization logic
 * 
 * Collection is triggered by:
 * - Initial page load
 * - URL changes (SPA navigation)
 * - Manual collection from popup
 * 
 * No scroll-triggered collection.
 */
(() => {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'weibo' });
    tryAutoCollectWeibo();

    let lastUrl = window.location.href;

    // Listen for URL changes (for SPA navigation)
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            tryAutoCollectWeibo();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
