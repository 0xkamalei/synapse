/**
 * X.com Content Collector
 * Extracts post content from X.com (Twitter) pages
 */

// Message types for communication with background script
const MessageType = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    COLLECT_RESULT: 'COLLECT_RESULT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
};

/**
 * Extract text content from a tweet element
 * @param {Element} tweetElement
 * @returns {string}
 */
function extractTweetText(tweetElement) {
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    if (!textElement) return '';
    return textElement.innerText || '';
}

/**
 * Extract images and videos from a tweet element
 * @param {Element} tweetElement
 * @returns {{images: string[], videos: string[]}}
 */
function extractTweetMedia(tweetElement) {
    const images = [];
    const videos = [];

    // Find video containers first to prioritize motion content
    const videoContainers = tweetElement.querySelectorAll('[data-testid="videoPlayer"]');
    const videoPosters = new Set();

    videoContainers.forEach((container, index) => {
        const video = container.querySelector('video');
        if (video) {
            const src = video.src;
            const poster = video.getAttribute('poster');

            console.log(`[Synapse] Found video ${index}:`, { src, poster });

            if (src && !videos.includes(src)) {
                videos.push(src);
            } else if (!src) {
                // Try to find src in source elements if not on video tag directly
                const source = video.querySelector('source');
                if (source && source.src && !videos.includes(source.src)) {
                    videos.push(source.src);
                    console.log(`[Synapse] Found video src in <source>:`, source.src);
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
                console.log('[Synapse] Skipping video poster image:', src);
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

    console.log('[Synapse] Extracted media:', { imageCount: images.length, videoCount: videos.length });
    return { images, videos };
}

/**
 * Extract timestamp from a tweet element
 * @param {Element} tweetElement
 * @returns {string}
 */
function extractTweetTimestamp(tweetElement) {
    const timeElement = tweetElement.querySelector('time');
    if (timeElement) {
        return timeElement.getAttribute('datetime') || new Date().toISOString();
    }
    return new Date().toISOString();
}

/**
 * Extract tweet URL from a tweet element
 * @param {Element} tweetElement
 * @returns {string}
 */
function extractTweetUrl(tweetElement) {
    // Try to find the permalink
    const timeElement = tweetElement.querySelector('time');
    if (timeElement) {
        const linkElement = timeElement.closest('a');
        if (linkElement) {
            return linkElement.href;
        }
    }

    // Fallback to current URL
    return window.location.href;
}

/**
 * Extract author info from a tweet element
 * @param {Element} tweetElement
 * @returns {{username: string, displayName: string}}
 */
function extractAuthorInfo(tweetElement) {
    const userNameLink = tweetElement.querySelector('[data-testid="User-Name"] a');
    let username = '';
    let displayName = '';

    if (userNameLink) {
        const href = userNameLink.getAttribute('href');
        username = href ? href.replace('/', '') : '';
    }

    const displayNameElement = tweetElement.querySelector('[data-testid="User-Name"] span');
    if (displayNameElement) {
        displayName = displayNameElement.innerText || '';
    }

    return { username, displayName };
}

/**
 * Collect data from a single tweet element
 * @param {Element} tweetElement
 * @returns {Object}
 */
function collectTweetData(tweetElement) {
    const text = extractTweetText(tweetElement);
    const { images, videos } = extractTweetMedia(tweetElement);
    const timestamp = extractTweetTimestamp(tweetElement);
    const url = extractTweetUrl(tweetElement);
    const author = extractAuthorInfo(tweetElement);

    const data = {
        source: 'X',
        type: videos.length > 0 ? 'video' : 'text',
        text,
        images,
        videos,
        timestamp,
        url,
        author,
        collectedAt: new Date().toISOString()
    };

    console.log('[Synapse] Collected tweet data:', data);
    return data;
}

/**
 * Find the main/focused tweet on the page
 * @returns {Element|null}
 */
function findMainTweet() {
    // On tweet detail page, find the main tweet (usually the first article)
    if (window.location.pathname.includes('/status/')) {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        // The main tweet is typically the first one on detail pages
        return articles[0] || null;
    }

    // On timeline, return null (user should click specific tweet)
    return null;
}

/**
 * Find all visible tweets on the page
 * @returns {Element[]}
 */
function findAllTweets() {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
}

/**
 * Collect the current/main tweet on the page
 * @returns {Object|null}
 */
function collectCurrentTweet() {
    const mainTweet = findMainTweet();
    if (!mainTweet) {
        return null;
    }
    return collectTweetData(mainTweet);
}

/**
 * Get the username from current page URL
 * @returns {string}
 */
function getCurrentPageUser() {
    const path = window.location.pathname;
    // URL format: /username/status/123 or /username
    const match = path.match(/^\/([^\/]+)/);
    return match ? match[1] : '';
}

/**
 * Get page info for the popup
 * @returns {Object}
 */
function getPageInfo() {
    const tweets = findAllTweets();
    const mainTweet = findMainTweet();
    const pageUser = getCurrentPageUser();

    let tweetAuthor = '';
    if (mainTweet) {
        const author = extractAuthorInfo(mainTweet);
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MessageType.COLLECT_CURRENT) {
        const mainTweet = findMainTweet();

        if (!mainTweet) {
            sendResponse({ success: false, error: 'No tweet found on page' });
            return true;
        }

        const data = collectTweetData(mainTweet);

        // Check if we have a target user to filter
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
    } else if (message.type === 'MANUAL_COLLECT') {
        const isDetail = window.location.pathname.includes('/status/');

        if (isDetail) {
            const mainTweet = findMainTweet();
            if (!mainTweet) {
                sendResponse({ success: false, error: 'No tweet found on page' });
                return true;
            }

            const data = collectTweetData(mainTweet);

            // Send to background for processing (bypassing interval)
            chrome.runtime.sendMessage({
                type: 'MANUAL_COLLECT',
                content: data
            }, response => {
                sendResponse(response);
            });
        } else {
            // Batch collect from profile/timeline
            const tweets = findAllTweets();
            if (tweets.length === 0) {
                sendResponse({ success: false, error: 'No tweets found on page' });
                return true;
            }

            const contents = tweets.map(t => collectTweetData(t));
            const pageUID = getCurrentPageUser();

            chrome.runtime.sendMessage({
                type: 'MANUAL_COLLECT_BATCH',
                contents,
                pageUID
            }, response => {
                sendResponse(response);
            });
        }
        return true; // Keep channel open for async response
    } else if (message.type === MessageType.GET_PAGE_INFO) {
        sendResponse(getPageInfo());
    }
    return true;
});

/**
 * Auto-collect on page load if on the target user's profile page
 */
async function tryAutoCollect() {
    // Get configuration
    const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;

    const config = response.config;
    let targetXUser = config.targetXUser;

    if (!targetXUser) {
        console.log('[Synapse] No target X user configured, skipping auto-collect');
        return;
    }

    // Clean up target username (remove @ if present)
    targetXUser = targetXUser.startsWith('@') ? targetXUser.substring(1) : targetXUser;

    // Check if current page is the target user's profile page
    // Path should be exactly /username (ignore case)
    const currentPath = window.location.pathname.toLowerCase();
    const targetPath = `/${targetXUser.toLowerCase()}`;

    if (currentPath !== targetPath) {
        console.log(`[Synapse] Not on target profile page (${targetPath}), current: ${currentPath}. Skipping auto-collect.`);
        return;
    }

    console.log(`[Synapse] On target profile page @${targetXUser}, starting auto-collect...`);

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    const tweets = findAllTweets();
    if (tweets.length === 0) {
        console.log('[Synapse] No tweets found for auto-collect');
        return;
    }

    const contents = tweets.map(t => collectTweetData(t));
    const pageUID = getCurrentPageUser();

    // Send to background for processing (respecting interval)
    chrome.runtime.sendMessage({
        type: 'AUTO_COLLECT_BATCH',
        contents,
        pageUID,
        source: 'X'
    }, response => {
        if (response?.success) {
            console.log(`[Synapse] Auto-collected ${response.collected} tweets successfully`);
        } else if (response?.reason === 'interval') {
            console.log('[Synapse] Skipped - collection interval not reached');
        } else if (response?.error) {
            console.log('[Synapse] Auto-collect failed:', response.error);
        }
    });
}

// Notify background script that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'x' });

// Try auto-collect after page loads
tryAutoCollect();

// Since X is a single-page app, we need to detect navigation changes
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[Synapse] URL changed, checking for auto-collect...');
        tryAutoCollect();
    }
});

observer.observe(document.body, { childList: true, subtree: true });

console.log('[Synapse] X.com collector loaded');


