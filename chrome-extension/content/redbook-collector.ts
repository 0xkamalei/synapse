/**
 * Redbook (Xiaohongshu) Content Collector
 * Extracts note content from Redbook/Xiaohongshu pages
 */

// Message types for communication with background script
const MessageTypeRedbook = {
    COLLECT_CURRENT: 'COLLECT_CURRENT',
    GET_PAGE_INFO: 'GET_PAGE_INFO'
} as const;

/**
 * Extract text content from a Redbook note element
 */
function extractRedbookText(noteElement: Element): string {
    // Find the title in the footer section
    const titleElement = noteElement.querySelector('.footer .title span');
    if (titleElement) {
        return (titleElement as HTMLElement).innerText?.trim() || '';
    }
    return '';
}

/**
 * Extract images from a Redbook note element
 */
function extractRedbookImages(noteElement: Element): string[] {
    const images: string[] = [];

    // Find the cover image
    const coverImg = noteElement.querySelector('.cover img');
    if (coverImg) {
        const htmlImg = coverImg as HTMLImageElement;
        let src = htmlImg.src;

        if (src && !src.startsWith('data:')) {
            // Remove query parameters for consistency
            src = src.split('?')[0];
            if (!images.includes(src)) {
                images.push(src);
            }
        }
    }

    return images;
}

/**
 * Extract videos from a Redbook note element
 * For video notes, we return the full Xiaohongshu URL with xsec_token which can be embedded in Notion
 */
function extractRedbookVideos(noteElement: Element): string[] {
    const videos: string[] = [];

    // Check if this note has a video indicator (play-icon)
    const hasVideo = noteElement.querySelector('.play-icon');
    if (hasVideo) {
        // Get the full URL with xsec_token (same as note URL)
        // Use .cover link which has the complete URL
        const linkElement = noteElement.querySelector('.cover[href]');
        if (linkElement) {
            const href = linkElement.getAttribute('href') || '';
            if (href) {
                // Convert to full URL and change path from /user/profile/xxx/noteId to /explore/noteId
                let fullUrl = href.startsWith('/') ? `https://www.xiaohongshu.com${href}` : href;
                // Extract note ID and query params, rebuild as /explore/ URL
                const match = fullUrl.match(/\/([a-zA-Z0-9]+)\?(.+)$/);
                if (match) {
                    const noteId = match[1];
                    const queryParams = match[2];
                    videos.push(`https://www.xiaohongshu.com/explore/${noteId}?${queryParams}`);
                }
            }
        }
    }
    //video can't play in notion directly, so we skip adding video links for now     
    return [];
}

/**
 * Extract author information from a Redbook note
 */
function extractRedbookAuthor(noteElement: Element): { username: string; displayName: string } {
    // Find author name in the footer
    const nameElement = noteElement.querySelector('.author-wrapper .author .name');
    const displayName = nameElement ? (nameElement as HTMLElement).innerText?.trim() || '' : '';

    // Extract username from the author link href
    let username = '';
    const linkElement = noteElement.querySelector('.author-wrapper .author[href*="/user/profile/"]');
    if (linkElement) {
        const href = linkElement.getAttribute('href') || '';
        // Extract user ID from URL: /user/profile/64f335df00000000050011ee
        const match = href.match(/\/user\/profile\/([^?/]+)/);
        if (match && match[1]) {
            username = match[1];
        }
    }

    return {
        username,
        displayName
    };
}

/**
 * Extract timestamp from a Redbook note
 * Note: Redbook notes don't display timestamps in the feed view
 * This would need to be extracted from the detail page
 */
function extractRedbookTimestamp(noteElement: Element): string {
    // Timestamps are not visible in the feed view
    // Would need to navigate to the note detail page to extract
    return '';
}

/**
 * Extract the note URL
 */
function extractRedbookUrl(noteElement: Element): string {
    const linkElement = noteElement.querySelector('.cover[href], .title[href]');
    if (linkElement) {
        const href = linkElement.getAttribute('href') || '';
        if (href) {
            // Convert relative URL to absolute if needed
            if (href.startsWith('/')) {
                return `https://www.xiaohongshu.com${href}`;
            }
            return href;
        }
    }
    return '';
}

/**
 * Find all note posts on the current Redbook user page
 */
function findAllPostsRedbook(): Element[] {
    // Find all note items in the feeds container
    const noteItems = Array.from(document.querySelectorAll('.feeds-container .note-item'));
    return noteItems;
}

/**
 * Collect data from a single note element (for testing)
 */
function collectNoteDataRedbook(noteElement: Element): CollectedContent {
    const text = extractRedbookText(noteElement);
    const images = extractRedbookImages(noteElement);
    const videos = extractRedbookVideos(noteElement);
    const author = extractRedbookAuthor(noteElement);
    const timestamp = extractRedbookTimestamp(noteElement);
    const url = extractRedbookUrl(noteElement);

    // Determine content type
    let type: ContentType = 'text';
    if (videos.length > 0) {
        type = 'video';
    } else if (images.length > 0) {
        type = 'image';
    }

    return {
        source: 'Redbook',
        type,
        text,
        images,
        videos,
        links: [],
        timestamp,
        url,
        author: {
            username: author.username,
            displayName: author.displayName
        },
        collectedAt: new Date().toISOString()
    };
}

/**
 * Check if the current URL is a Redbook user profile page
 */
function isRedbookUserPage(): boolean {
    return window.location.hostname.includes('xiaohongshu.com') &&
           window.location.pathname.includes('/user/profile/');
}

/**
 * Extract the current user ID from the URL
 */
function getCurrentRedbookUserId(): string {
    const match = window.location.pathname.match(/\/user\/profile\/([^/?]+)/);
    return match ? match[1] : '';
}

/**
 * Try to automatically collect posts from the current Redbook page
 */
async function tryAutoCollectRedbook() {
    // Check if we're on a user profile page
    if (!isRedbookUserPage()) {
        console.log('[Synapse] Redbook: Not on a user profile page');
        return;
    }

    // Get config from background
    const response: any = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) {
        console.log('[Synapse] Redbook: Failed to get config');
        return;
    }

    const config = response.config;

    if (!config.targetRedbookUser) {
        console.log('[Synapse] Redbook: Target user not configured, skipping auto-collect');
        return;
    }

    const currentUserId = getCurrentRedbookUserId();

    // Check if current page matches target user
    if (currentUserId !== config.targetRedbookUser) {
        console.log('[Synapse] Redbook: Current user does not match target:', currentUserId, 'vs', config.targetRedbookUser);
        return;
    }

    // Check interval
    const interval = config.collectIntervalHours ?? 4;
    const lastCollectForSource = config.lastCollectTimes?.redbook;
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;
    const now = Date.now();

    if (interval > 0 && lastCollect > 0) {
        const hoursSinceLast = (now - lastCollect) / (1000 * 60 * 60);
        if (hoursSinceLast < interval) {
            console.log(`[Synapse] Redbook: Skipping auto-collect, last collect was ${hoursSinceLast.toFixed(2)} hours ago (interval: ${interval}h)`);
            return;
        }
    }

    console.log('[Synapse] Redbook: ✓ On target user page - starting collection...');

    // Wait for page content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Find all posts
    const posts = findAllPostsRedbook();

    if (posts.length === 0) {
        console.log('[Synapse] Redbook: No notes found on page');
        return;
    }

    // Extract content from each post
    const allContent = posts
        .map(post => collectNoteDataRedbook(post))
        .filter(data => data.text && data.text.trim().length > 0);

    console.log('[Synapse] Redbook: Found', allContent.length, 'notes with content');

    // Send to background for processing (this will use logger)
    if (allContent.length > 0) {
        chrome.runtime.sendMessage({
            type: 'CONTENT_TO_BG_PROCESS',
            contents: allContent,
            pageUID: currentUserId
        }, response => {
            if (response?.success) {
                console.log(`[Synapse] Redbook: Auto-collected ${response.collected} items, skipped ${response.skipped}`);
            } else {
                console.log('[Synapse] Redbook: Collection failed', response?.error);
            }
        });
    }
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MessageTypeRedbook.COLLECT_CURRENT || message.type === 'POP_TO_CONTENT_COLLECT') {
        console.log('[Synapse] Redbook: Manual collection triggered');

        const currentUserId = getCurrentRedbookUserId();

        // Find all posts
        const posts = findAllPostsRedbook();

        // Extract content
        const allContent = posts
            .map(post => collectNoteDataRedbook(post))
            .filter(data => data.text && data.text.trim().length > 0);

        console.log('[Synapse] Redbook: Found', allContent.length, 'notes with content');

        // Send to background for processing (this will use logger)
        if (allContent.length > 0) {
            chrome.runtime.sendMessage({
                type: 'CONTENT_TO_BG_PROCESS',
                contents: allContent,
                pageUID: currentUserId
            }, response => {
                sendResponse({
                    success: response?.success ?? false,
                    collected: response?.collected ?? 0,
                    skipped: response?.skipped ?? 0
                });
            });
        } else {
            sendResponse({
                success: true,
                collected: 0,
                skipped: 0
            });
        }

        return true;
    }

    if (message.type === MessageTypeRedbook.GET_PAGE_INFO) {
        const isUserPage = isRedbookUserPage();
        const userId = isUserPage ? getCurrentRedbookUserId() : '';
        const postCount = findAllPostsRedbook().length;

        sendResponse({
            isUserPage,
            userId,
            postCount,
            pageUrl: window.location.href
        });

        return true;
    }
});

// Auto-collect when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAutoCollectRedbook);
} else {
    tryAutoCollectRedbook();
}

// Also try to collect after a delay (for dynamic content)
setTimeout(tryAutoCollectRedbook, 3000);

console.log('[Redbook Collector] Script loaded');
