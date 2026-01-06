/**
 * X.com Content Collector
 * Extracts feed content from X.com (Twitter)
 */


// Message types for communication with background script
const MessageTypeX = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    COLLECT_RESULT: 'COLLECT_RESULT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
} as const;

/**
 * Extract text content from a tweet element
 */
function extractTweetText(tweetElement: Element): string {
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    if (!textElement) return '';
    return (textElement as HTMLElement).innerText || '';
}

/**
 * Extract images and videos from a tweet element
 */
function extractTweetMedia(tweetElement: Element): { images: string[]; videos: string[] } {
    const images: string[] = [];
    const videos: string[] = [];

    // Find video containers first to prioritize motion content
    const videoContainers = tweetElement.querySelectorAll('[data-testid="videoPlayer"]');
    const videoPosters = new Set<string>();

    videoContainers.forEach((container) => {
        const video = container.querySelector('video');
        if (video) {
            const src = video.src;
            const poster = video.getAttribute('poster');

            if (src && !videos.includes(src)) {
                videos.push(src);
            } else if (!src) {
                const source = video.querySelector('source');
                if (source && source.src && !videos.includes(source.src)) {
                    videos.push(source.src);
                }
            }

            if (poster) {
                videoPosters.add(poster);
            }
        }
    });

    // Find all images in the tweet (excluding profile pics and emojis)
    const photoContainers = tweetElement.querySelectorAll('[data-testid="tweetPhoto"]');
    photoContainers.forEach(container => {
        const imgElements = container.querySelectorAll('img');
        imgElements.forEach(img => {
            let src = img.src;

            // Skip if this image is a video poster to avoid duplicates
            if (videoPosters.has(src)) {
                return;
            }

            // Get higher quality version of the image
            if (src.includes('pbs.twimg.com')) {
                src = src.replace(/&name=\w+/, '&name=large');
            }

            if (!images.includes(src)) {
                images.push(src);
            }
        });
    });

    return { images, videos };
}

/**
 * Parse X.com time string to ISO format
 */
function parseXTime(timeText: string): string {
    const now = new Date();
    timeText = timeText.trim();

    // Handle relative: "5h", "2m", "10s"
    const relativeMatch = timeText.match(/^(\d+)([hms])$/);
    if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        const date = new Date(now);
        if (unit === 'h') date.setHours(date.getHours() - value);
        if (unit === 'm') date.setMinutes(date.getMinutes() - value);
        if (unit === 's') date.setSeconds(date.getSeconds() - value);
        return date.toISOString();
    }

    // Handle "Jan 6"
    const monthDayMatch = timeText.match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
    if (monthDayMatch) {
        const months: Record<string, number> = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        const month = months[monthDayMatch[1]];
        const day = parseInt(monthDayMatch[2]);
        const date = new Date(now.getFullYear(), month, day);
        // If date is in future, assume last year
        if (date > now) date.setFullYear(date.getFullYear() - 1);
        return date.toISOString();
    }

    // Handle "Jan 6, 2024"
    const fullDateMatch = timeText.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})$/);
    if (fullDateMatch) {
        const months: Record<string, number> = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        const month = months[fullDateMatch[1]];
        const day = parseInt(fullDateMatch[2]);
        const year = parseInt(fullDateMatch[3]);
        return new Date(year, month, day).toISOString();
    }

    // Fallback to native parsing
    const parsed = new Date(timeText);
    return !isNaN(parsed.getTime()) ? parsed.toISOString() : now.toISOString();
}

/**
 * Extract timestamp from a tweet element
 */
function extractTweetTimestamp(tweetElement: Element): string {
    const timeElement = tweetElement.querySelector('time');
    if (timeElement) {
        // Priority 1: ISO datetime attribute
        const isoString = timeElement.getAttribute('datetime');
        if (isoString) return isoString;

        // Priority 2: Visual text parsing
        const visualText = timeElement.textContent || '';
        if (visualText) return parseXTime(visualText);
    }
    return new Date().toISOString();
}

/**
 * Extract tweet URL from a tweet element
 */
function extractTweetUrl(tweetElement: Element): string {
    const timeElement = tweetElement.querySelector('time');
    if (timeElement) {
        const linkElement = timeElement.closest('a');
        if (linkElement) {
            return linkElement.href;
        }
    }
    return window.location.href;
}

/**
 * Extract author info from a tweet element
 */
function extractAuthorInfoX(tweetElement: Element): AuthorInfo {
    const userNameLink = tweetElement.querySelector('[data-testid="User-Name"] a');
    let username = '';
    let displayName = '';

    if (userNameLink) {
        const href = userNameLink.getAttribute('href');
        username = href ? href.replace('/', '') : '';
    }

    const displayNameElement = tweetElement.querySelector('[data-testid="User-Name"] span');
    if (displayNameElement) {
        displayName = (displayNameElement as HTMLElement).innerText || '';
    }

    return { username, displayName };
}

/**
 * Extract all data from a tweet element
 */
function collectTweetDataX(tweetElement: Element): CollectedContent {
    const text = extractTweetText(tweetElement);
    const { images, videos } = extractTweetMedia(tweetElement);
    const timestamp = extractTweetTimestamp(tweetElement);
    const url = extractTweetUrl(tweetElement);
    const author = extractAuthorInfoX(tweetElement);

    return {
        source: 'X' as const,
        type: videos.length > 0 ? 'video' : images.length > 0 ? 'image' : 'text',
        text,
        images,
        videos,
        timestamp,
        url,
        author,
        collectedAt: new Date().toISOString()
    };
}

/**
 * Find the main/focused tweet on the page
 */
function findMainTweetX(): Element | null {
    if (window.location.pathname.includes('/status/')) {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        return articles[0] || null;
    }
    return null;
}

/**
 * Find all tweet elements on the page
 */
function findAllTweetsX(): Element[] {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
}

/**
 * Get the username from current page URL
 */
function getCurrentPageUserX(): string {
    const path = window.location.pathname;
    const match = path.match(/^\/([^\/]+)/);
    return match ? match[1] : '';
}

/**
 * Get page info for the popup
 */
function getPageInfoX(): any {
    const tweets = findAllTweetsX();
    const mainTweet = findMainTweetX();
    const pageUser = getCurrentPageUserX();

    let tweetAuthor = '';
    if (mainTweet) {
        const author = extractAuthorInfoX(mainTweet);
        tweetAuthor = author.username;
    }

    return {
        isXPage: true,
        isTweetDetail: window.location.pathname.includes('/status/'),
        tweetCount: tweets.length,
        hasMainTweet: mainTweet !== null,
        currentUrl: window.location.href,
        pageUser: pageUser,
        tweetAuthor: tweetAuthor
    };
}



// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === MessageTypeX.COLLECT_CURRENT) {
        const mainTweetX = findMainTweetX();

        if (!mainTweetX) {
            sendResponse({ success: false, error: 'No tweet found on page' });
            return true;
        }

        const data = collectTweetDataX(mainTweetX);

        if (message.targetUser && data.author.username) {
            const targetUser = message.targetUser.toLowerCase();
            const tweetAuthor = data.author.username.toLowerCase();

            if (tweetAuthor !== targetUser) {
                sendResponse({
                    success: false,
                    error: `Tweet is from @${data.author.username}, not @${message.targetUser}`
                });
                return true;
            }
        }

        sendResponse({ success: true, data });
    } else if (message.type === 'POP_TO_CONTENT_COLLECT') {
        const isDetail = window.location.pathname.includes('/status/');

        if (isDetail) {
            const mainTweetX = findMainTweetX();
            if (!mainTweetX) {
                sendResponse({ success: false, error: 'No tweet found on page' });
                return true;
            }

            const data = collectTweetDataX(mainTweetX);

            chrome.runtime.sendMessage({
                type: 'CONTENT_TO_BG_PROCESS',
                contents: [data],
                pageUID: data.author.username
            }, response => {
                sendResponse(response);
            });
        } else {
            const tweets = findAllTweetsX();
            if (tweets.length === 0) {
                sendResponse({ success: false, error: 'No tweets found on page' });
                return true;
            }

            const contents = tweets
                .map(t => collectTweetDataX(t))
                .filter(data => data.text && data.text.trim().length > 0);
            const pageUID = getCurrentPageUserX();

            chrome.runtime.sendMessage({
                type: 'CONTENT_TO_BG_PROCESS',
                contents,
                pageUID
            }, response => {
                sendResponse(response);
            });
        }
        return true;
    } else if (message.type === MessageTypeX.GET_PAGE_INFO) {
        sendResponse(getPageInfoX());
    }
    return true;
});

/**
 * Auto-collect on page load if on the target user's profile page
 */
async function tryAutoCollectX(): Promise<void> {
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;

    const config = response.config;
    let targetXUser = config.targetXUser;

    if (!targetXUser) return;

    targetXUser = targetXUser.startsWith('@') ? targetXUser.substring(1) : targetXUser;

    const currentPath = window.location.pathname.toLowerCase();
    const targetPath = `/${targetXUser.toLowerCase()}`;

    if (currentPath !== targetPath) {
        return;
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    const tweets = findAllTweetsX();
    if (tweets.length === 0) return;

    const contents = tweets
        .map(t => collectTweetDataX(t))
        .filter(data => data.text && data.text.trim().length > 0);
    const pageUID = getCurrentPageUserX();

    chrome.runtime.sendMessage({
        type: 'CONTENT_TO_BG_PROCESS',
        contents,
        pageUID,
        source: 'X'
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] Auto-collected ${response.collected} tweets successfully`);
        }
    });
}

/**
 * Initialization logic
 */
(() => {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'x' });
    tryAutoCollectX();

    let lastUrl = window.location.href;
    let lastScrollTop = 0;
    let debounceTimer: number | undefined;

    const triggerCollect = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            tryAutoCollectX();
        }, 10000); // Wait 10 seconds
    };

    // 1. Listen for URL changes (immediate)
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            if (debounceTimer) clearTimeout(debounceTimer);
            tryAutoCollectX();
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
