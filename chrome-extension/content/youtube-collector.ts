/**
 * YouTube Collector - Content script for collecting videos from YouTube channel pages
 * Designed to work with YouTube's /@username/videos pages
 */
(() => {
  // ===== URL Detection =====

  /**
   * Check if the current URL is a YouTube channel videos page
   */
  function isChannelVideoPage(): boolean {
    return /youtube\.com\/@([^/]+)\/videos/.test(window.location.href);
  }

  /**
   * Get the current channel handle from URL
   */
  function getCurrentChannelHandle(): string {
    const match = window.location.href.match(/youtube\.com\/@([^/]+)\/videos/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Check if the current URL is a target YouTube channel videos page
   */
  function isTargetURL(targetChannels: string[]): boolean {
    if (!isChannelVideoPage()) return false;
    if (!targetChannels || !Array.isArray(targetChannels) || targetChannels.length === 0)
      return false;

    const currentHandle = getCurrentChannelHandle();
    return targetChannels.some((t) => t.replace(/^@/, '').toLowerCase() === currentHandle);
  }

  // ===== DOM Element Finders =====

  /**
   * Find all video items on the page
   * Excludes ads (ytd-ad-slot-renderer) and shorts (ytm-shorts-lockup-view-model)
   */
  function findAllVideosYoutube(): Element[] {
    const allItems = document.querySelectorAll('ytd-rich-item-renderer');
    const videos: Element[] = [];

    for (const item of allItems) {
      // Skip if this contains an ad
      if (item.querySelector('ytd-ad-slot-renderer')) {
        continue;
      }

      // Skip if this is a Shorts item
      if (item.querySelector('ytm-shorts-lockup-view-model')) {
        continue;
      }

      // Must have a video link (ytd-rich-grid-media or yt-lockup-view-model)
      // Try modern structure first: ytd-rich-grid-media with thumbnail link
      const gridMedia = item.querySelector('ytd-rich-grid-media');
      if (gridMedia) {
        const thumbnailLink = gridMedia.querySelector('a#thumbnail[href*="/watch?v="]');
        if (thumbnailLink) {
          videos.push(item);
          continue;
        }
      }

      // Fallback to older structure with yt-lockup-view-model
      const lockup = item.querySelector('yt-lockup-view-model');
      if (lockup) {
        videos.push(item);
      }
    }

    return videos;
  }

  // ===== Data Extractors =====

  /**
   * Extract video ID from the lockup element
   */
  function extractVideoIdYoutube(element: Element): string | null {
    // Try newer structure first: extract from thumbnail link href
    const thumbnailLink = element.querySelector('a#thumbnail[href*="/watch?v="]');
    if (thumbnailLink) {
      const href = thumbnailLink.getAttribute('href');
      if (href) {
        const match = href.match(/[?&]v=([^&]+)/);
        if (match) {
          return match[1];
        }
      }
    }

    // Fallback to older structure: content-id-{videoId} class
    const lockup = element.querySelector('yt-lockup-view-model .yt-lockup-view-model');
    if (!lockup) return null;

    const classes = lockup.className.split(' ');
    for (const cls of classes) {
      if (cls.startsWith('content-id-')) {
        return cls.replace('content-id-', '');
      }
    }
    return null;
  }

  /**
   * Extract video title from the element
   */
  function extractVideoTitleYoutube(element: Element): string {
    // Try newer structure: video-title-link title attribute or yt-formatted-string#video-title
    const titleLink = element.querySelector('#video-title-link');
    if (titleLink) {
      const title = titleLink.getAttribute('title');
      if (title) return title;

      const formattedString = titleLink.querySelector('yt-formatted-string#video-title');
      if (formattedString?.textContent) {
        return formattedString.textContent.trim();
      }
    }

    // Try older structure: .yt-lockup-metadata-view-model__title
    const oldTitleLink = element.querySelector('.yt-lockup-metadata-view-model__title');
    if (oldTitleLink) {
      const span = oldTitleLink.querySelector('span.yt-core-attributed-string');
      if (span?.textContent) {
        return span.textContent.trim();
      }
    }

    // Try the h3 title attribute
    const h3 = element.querySelector('h3.yt-lockup-metadata-view-model__heading-reset');
    if (h3) {
      const title = h3.getAttribute('title');
      if (title) return title;
    }

    return '';
  }

  /**
   * Extract video thumbnail URL
   */
  function extractVideoThumbnailYoutube(element: Element): string | null {
    // Try newer structure: ytd-thumbnail img
    const ytdThumbnail = element.querySelector('ytd-thumbnail img.ytCoreImageHost');
    if (ytdThumbnail) {
      const src = ytdThumbnail.getAttribute('src');
      if (src && src.includes('ytimg.com')) {
        return src;
      }
    }

    // Try older structure: yt-thumbnail-view-model img
    const img = element.querySelector('yt-thumbnail-view-model img.ytCoreImageHost');
    if (img) {
      const src = img.getAttribute('src');
      if (src && src.includes('ytimg.com')) {
        return src;
      }
    }
    return null;
  }

  /**
   * Extract video URL
   */
  function extractVideoUrlYoutube(element: Element): string | null {
    const videoId = extractVideoIdYoutube(element);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // Fallback: find the watch link
    const link = element.querySelector('a[href^="/watch?v="]');
    if (link) {
      const href = link.getAttribute('href');
      if (href) {
        return `https://www.youtube.com${href.split('&')[0]}`;
      }
    }

    return null;
  }

  /**
   * Extract video duration badge (e.g., "15:18")
   */
  function extractVideoDurationYoutube(element: Element): string | null {
    const badge = element.querySelector('.yt-badge-shape__text');
    if (badge?.textContent) {
      const text = badge.textContent.trim();
      // Check if it looks like a duration (contains colon)
      if (text.includes(':')) {
        return text;
      }
    }
    return null;
  }

  /**
   * Extract page-level channel username from the URL
   * Returns the @username from URLs like /@username/videos
   */
  function extractPageChannelUsernameYoutube(): string {
    const url = window.location.href;
    const match = url.match(/youtube\.com\/@([^/]+)/);
    if (match) {
      return `@${match[1]}`;
    }
    return '';
  }

  /**
   * Extract channel name from the element
   */
  function extractChannelNameYoutube(element: Element): string {
    // Find the channel link in metadata
    const channelLink = element.querySelector(
      '.yt-content-metadata-view-model__metadata-row a[href^="/@"]',
    );
    if (channelLink?.textContent) {
      return channelLink.textContent.trim();
    }

    // Fallback: avatar aria-label
    const avatar = element.querySelector('.yt-spec-avatar-shape');
    if (avatar) {
      const label = avatar.getAttribute('aria-label');
      if (label?.startsWith('Go to channel ')) {
        return label.replace('Go to channel ', '');
      }
    }

    // Fallback: extract from URL (for channel's own videos page)
    return extractPageChannelUsernameYoutube();
  }

  /**
   * Extract views count (e.g., "27K views")
   */
  function extractViewsYoutube(element: Element): string | null {
    const metadataTexts = element.querySelectorAll(
      '.yt-content-metadata-view-model__metadata-text',
    );
    for (const text of metadataTexts) {
      const content = text.textContent?.trim();
      if (content?.includes('views')) {
        return content;
      }
    }
    return null;
  }

  /**
   * Extract relative time text (e.g., "8 days ago")
   */
  function extractRelativeTimeYoutube(element: Element): string | null {
    const metadataTexts = element.querySelectorAll(
      '.yt-content-metadata-view-model__metadata-text',
    );
    for (const text of metadataTexts) {
      const content = text.textContent?.trim();
      if (content && (content.includes('ago') || content.includes('Streamed'))) {
        return content;
      }
    }
    return null;
  }

  /**
   * Parse relative time string to absolute Date
   * Supports: "X seconds/minutes/hours/days/weeks/months/years ago"
   */
  function parseRelativeTimeYoutube(relativeTime: string): Date {
    const now = new Date();

    // Handle "Streamed X time ago" format
    const cleanTime = relativeTime.replace('Streamed ', '');

    const patterns: Array<{
      regex: RegExp;
      unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
    }> = [
      { regex: /(\d+)\s*second/i, unit: 'seconds' },
      { regex: /(\d+)\s*minute/i, unit: 'minutes' },
      { regex: /(\d+)\s*hour/i, unit: 'hours' },
      { regex: /(\d+)\s*day/i, unit: 'days' },
      { regex: /(\d+)\s*week/i, unit: 'weeks' },
      { regex: /(\d+)\s*month/i, unit: 'months' },
      { regex: /(\d+)\s*year/i, unit: 'years' },
    ];

    for (const { regex, unit } of patterns) {
      const match = cleanTime.match(regex);
      if (match) {
        const value = parseInt(match[1], 10);
        const result = new Date(now);

        switch (unit) {
          case 'seconds':
            result.setSeconds(result.getSeconds() - value);
            break;
          case 'minutes':
            result.setMinutes(result.getMinutes() - value);
            break;
          case 'hours':
            result.setHours(result.getHours() - value);
            break;
          case 'days':
            result.setDate(result.getDate() - value);
            break;
          case 'weeks':
            result.setDate(result.getDate() - value * 7);
            break;
          case 'months':
            result.setMonth(result.getMonth() - value);
            break;
          case 'years':
            result.setFullYear(result.getFullYear() - value);
            break;
        }

        return result;
      }
    }

    // Return current time if parsing fails
    return now;
  }

  /**
   * Collect data from a single video element
   */
  function collectVideoDataYoutube(element: Element): CollectedContent | null {
    const videoId = extractVideoIdYoutube(element);
    const title = extractVideoTitleYoutube(element);
    const url = extractVideoUrlYoutube(element);

    // Must have at least video ID and title
    if (!videoId || !title) {
      return null;
    }

    const thumbnail = extractVideoThumbnailYoutube(element);
    const channel = extractChannelNameYoutube(element);
    const views = extractViewsYoutube(element);
    const relativeTime = extractRelativeTimeYoutube(element);
    const duration = extractVideoDurationYoutube(element);

    // Parse timestamp - default to now if not available
    let timestamp: Date;
    if (relativeTime) {
      timestamp = parseRelativeTimeYoutube(relativeTime);
    } else {
      timestamp = new Date();
    }

    // Build text content with video info
    const textParts = [title];
    if (duration) {
      textParts.push(`[${duration}]`);
    }
    if (views) {
      textParts.push(`${views}`);
    }
    if (relativeTime) {
      textParts.push(`(${relativeTime})`);
    }

    const content: CollectedContent = {
      source: 'YouTube',
      type: 'video',
      text: textParts.join(' '),
      images: thumbnail ? [thumbnail] : [],
      videos: url ? [url] : [`https://www.youtube.com/watch?v=${videoId}`],
      timestamp: timestamp.toISOString(),
      url: url || `https://www.youtube.com/watch?v=${videoId}`,
      author: {
        username: channel || 'Unknown',
        displayName: channel || 'Unknown',
      },
      collectedAt: new Date().toISOString(),
    };

    return content;
  }

  // ===== Main Collection Function =====

  /**
   * Auto-collect videos if on target channel's page
   */
  async function tryAutoCollect(): Promise<void> {
    const config = await chrome.storage.sync.get(['targetYoutubeChannel', 'enabledSources']);
    let targetChannels = config.targetYoutubeChannel as string[] | undefined;
    if (typeof targetChannels === 'string') targetChannels = [targetChannels];

    const enabledSources = (config.enabledSources as string[]) || [];
    const autoCollect = enabledSources.includes('youtube');

    if (
      !autoCollect ||
      !targetChannels ||
      !Array.isArray(targetChannels) ||
      targetChannels.length === 0
    ) {
      console.log('[Synapse YouTube] Auto-collect disabled or no target channel configured');
      return;
    }

    if (!isTargetURL(targetChannels)) {
      console.log('[Synapse YouTube] Not on target channel page');
      return;
    }

    console.log('[Synapse YouTube] On target channel page, collecting videos...');

    const videos = findAllVideosYoutube();
    if (videos.length === 0) {
      console.log('[Synapse YouTube] No videos found on page');
      return;
    }

    const collectedContents: CollectedContent[] = [];
    for (const video of videos) {
      const content = collectVideoDataYoutube(video);
      if (content) {
        collectedContents.push(content);
      }
    }

    if (collectedContents.length > 0) {
      console.log(
        `[Synapse YouTube] Collected ${collectedContents.length} videos, sending to background...`,
      );

      // Send to background for processing
      chrome.runtime.sendMessage(
        {
          type: 'CONTENT_TO_BG_PROCESS',
          contents: collectedContents,
          pageUID: `youtube_${Date.now()}`,
        },
        (response) => {
          if (response?.success) {
            console.log(
              `[Synapse YouTube] Successfully processed: ${response.collected} saved, ${response.skipped} skipped`,
            );
          } else {
            console.error('[Synapse YouTube] Failed to process content:', response?.error);
          }
        },
      );
    }
  }

  // ===== Page Info =====

  /**
   * Get page info for the popup display
   */
  async function getPageInfo(): Promise<PageInfo> {
    const currentUrl = window.location.href;

    // Get config to check if this is the target page
    const config = await chrome.storage.sync.get(['targetYoutubeChannel']);
    let targetChannels = config.targetYoutubeChannel as string[] | undefined;
    if (typeof targetChannels === 'string') targetChannels = [targetChannels];

    const isMatched = isTargetURL(targetChannels || []);

    // Extract channel username from URL
    const channelUsername = extractPageChannelUsernameYoutube();

    // Extract channel name from page title (format: "Channel Name - YouTube")
    let channelName = '';
    const titleMatch = document.title.match(/^(.+?)\s*-\s*YouTube$/);
    if (titleMatch) {
      channelName = titleMatch[1].trim();
    }

    const videos = findAllVideosYoutube();

    return {
      isTargetPage: isMatched,
      itemCount: videos.length,
      currentUrl,
      pageIdentifier: channelUsername,
      pageTitle: channelName || channelUsername || document.title,
    };
  }

  // ===== Initialization =====

  // Initialize collector
  // Initialization logic
  // Only run in browser environment (not in test)
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return;
  }

  console.log('[Synapse YouTube] Content script loaded');

  // Notify background that content script is ready
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'youtube' });

  // Wait for DOM to be fully loaded before trying to collect
  const initCollector = () => {
    console.log('[Synapse YouTube] DOM ready, attempting auto-collect...');

    // Add a delay to ensure YouTube has rendered the content
    setTimeout(() => {
      tryAutoCollect();
    }, 2000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollector);
  } else {
    initCollector();
  }

  // Listen for URL changes (for SPA navigation)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[Synapse YouTube] URL changed, trying auto-collect...');
      // Wait for new content to render
      setTimeout(() => {
        tryAutoCollect();
      }, 2000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'POP_TO_CONTENT_COLLECT') {
      console.log('[Synapse YouTube] Received collect request from popup');

      const videos = findAllVideosYoutube();
      const collectedContents: CollectedContent[] = [];

      for (const video of videos) {
        const content = collectVideoDataYoutube(video);
        if (content) {
          collectedContents.push(content);
        }
      }

      if (collectedContents.length > 0) {
        // Send to background for processing
        chrome.runtime.sendMessage(
          {
            type: 'CONTENT_TO_BG_PROCESS',
            contents: collectedContents,
            pageUID: `youtube_manual_${Date.now()}`,
          },
          (response) => {
            if (response?.success) {
              sendResponse({
                success: true,
                count: collectedContents.length,
                collected: response.collected,
                skipped: response.skipped,
              });
            } else {
              sendResponse({
                success: false,
                error: response?.error || 'Unknown error',
              });
            }
          },
        );
      } else {
        sendResponse({ success: false, error: 'No videos found' });
      }

      return true; // Async response
    } else if (message.type === 'GET_PAGE_INFO') {
      getPageInfo().then((pageInfo) => {
        sendResponse(pageInfo);
      });
      return true; // Async response
    }
  });

  console.log('[Synapse YouTube] Collector initialized');
})();
