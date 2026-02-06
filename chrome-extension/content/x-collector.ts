/**
 * X.com Content Collector
 * Extracts feed content from X.com (Twitter)
 */
(() => {
  /**
   * Extract text content from a tweet element
   */
  function extractTweetText(tweetElement: Element): string {
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    if (!textElement) return '';
    return (textElement as HTMLElement).innerText || '';
  }

  /**
   * Extract hashtags from tweet text
   * Matches hashtags in format: #word or #中文 (supports non-Latin characters)
   */
  function extractHashtags(text: string): string[] {
    if (!text) return [];
    // Match hashtags: # followed by word characters (including Unicode letters)
    const hashtagRegex = /#([\w\u4e00-\u9fa5]+)/g;
    const matches = text.matchAll(hashtagRegex);
    const tags = new Set<string>();
    for (const match of matches) {
      tags.add(match[1]); // Add the hashtag without the # symbol
    }
    return Array.from(tags);
  }

  /**
   * Convert image URL to Base64 string
   */
  async function imageUrlToBase64(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('[Synapse] Failed to convert image to base64:', url, err);
      return url; // Fallback to original URL
    }
  }

  /**
   * Extract images and videos from a tweet element
   */
  async function extractTweetMedia(tweetElement: Element): Promise<{ images: string[]; videos: string[] }> {
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
    photoContainers.forEach((container) => {
      const imgElements = container.querySelectorAll('img');
      imgElements.forEach((img) => {
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

    // Convert images to base64
    const base64Images = await Promise.all(images.map((url) => imageUrlToBase64(url)));

    return { images: base64Images, videos };
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
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
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
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
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
  async function collectTweetDataX(tweetElement: Element): Promise<CollectedContent> {
    const text = extractTweetText(tweetElement);
    const { images, videos } = await extractTweetMedia(tweetElement);
    const timestamp = extractTweetTimestamp(tweetElement);
    const url = extractTweetUrl(tweetElement);
    const author = extractAuthorInfoX(tweetElement);
    const tags = extractHashtags(text);

    return {
      source: 'X' as const,
      type: videos.length > 0 ? 'video' : images.length > 0 ? 'image' : 'text',
      text,
      images,
      videos,
      links: [],
      tags,
      timestamp,
      url,
      author,
      collectedAt: new Date().toISOString(),
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
    const match = path.match(/^\/([^/]+)/);
    return match ? match[1] : '';
  }

  /**
   * Check if current page is the target user's profile page
   */
  function isTargetURL(targetUsers: string[]): boolean {
    if (!targetUsers || !Array.isArray(targetUsers) || targetUsers.length === 0) return false;

    const currentPath = window.location.pathname.toLowerCase();

    return targetUsers.some((targetUser) => {
      if (!targetUser) return false;
      const normalizedTarget = targetUser.startsWith('@')
        ? targetUser.substring(1).toLowerCase()
        : targetUser.toLowerCase();
      // Exact match for profile page: /username
      return currentPath === `/${normalizedTarget}`;
    });
  }

  /**
   * Filter collected contents by target users
   */
  function filterByTargetUsers(
    contents: CollectedContent[],
    targetUsers: string[],
  ): CollectedContent[] {
    if (!targetUsers || targetUsers.length === 0) return contents;

    const normalizedTargets = targetUsers.map((u) =>
      u.startsWith('@') ? u.substring(1).toLowerCase() : u.toLowerCase(),
    );

    return contents.filter((item) => {
      if (!item.author || !item.author.username) return false;
      const username = item.author.username.toLowerCase();
      return normalizedTargets.includes(username);
    });
  }

  /**
   * Get page info for the popup
   */
  async function getPageInfo(): Promise<PageInfo> {
    const tweets = findAllTweetsX();
    const mainTweet = findMainTweetX();
    const pageUser = getCurrentPageUserX();

    // Get config to check if this is the target page
    const response: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    let targetXUsers = response?.config?.targetXUser || [];
    // Handle potential single string (migration fallback)
    if (typeof targetXUsers === 'string') {
      targetXUsers = [targetXUsers];
    }

    const isMatched = isTargetURL(targetXUsers);

    let tweetAuthor = '';
    if (mainTweet) {
      const author = extractAuthorInfoX(mainTweet);
      tweetAuthor = author.username;
    }

    return {
      isTargetPage: isMatched,
      itemCount: tweets.length,
      currentUrl: window.location.href,
      pageIdentifier: pageUser,
      // Additional platform-specific data
      isTweetDetail: window.location.pathname.includes('/status/'),
      hasMainTweet: mainTweet !== null,
      tweetAuthor: tweetAuthor,
    };
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'POP_TO_CONTENT_COLLECT') {
      (async () => {
        const isDetail = window.location.pathname.includes('/status/');

        if (isDetail) {
          const mainTweetX = findMainTweetX();
          if (!mainTweetX) {
            sendResponse({ success: false, error: 'No tweet found on page' });
            return;
          }

          const data = await collectTweetDataX(mainTweetX);

          // Get config to filter by target users
          const response: any = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
          });
          let targetXUsers = response?.config?.targetXUser || [];
          if (typeof targetXUsers === 'string') targetXUsers = [targetXUsers];

          const filteredContents = filterByTargetUsers([data], targetXUsers);

          if (filteredContents.length === 0) {
            sendResponse({ success: false, error: 'Author is not in target user list' });
            return;
          }

          chrome.runtime.sendMessage(
            {
              type: 'CONTENT_TO_BG_PROCESS',
              contents: filteredContents,
              pageUID: data.author.username,
            },
            (response) => {
              sendResponse(response);
            },
          );
        } else {
          const tweets = findAllTweetsX();
          if (tweets.length === 0) {
            sendResponse({ success: false, error: 'No tweets found on page' });
            return;
          }

          const contentPromises = tweets.map((t) => collectTweetDataX(t));
          const resolvedContents = await Promise.all(contentPromises);
          const contents = resolvedContents.filter(
            (data) => data.text && data.text.trim().length > 0,
          );

          // Get config to filter by target users
          const response: any = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
          });
          let targetXUsers = response?.config?.targetXUser || [];
          if (typeof targetXUsers === 'string') targetXUsers = [targetXUsers];

          const filteredContents = filterByTargetUsers(contents, targetXUsers);
          const pageUID = getCurrentPageUserX();

          chrome.runtime.sendMessage(
            {
              type: 'CONTENT_TO_BG_PROCESS',
              contents: filteredContents,
              pageUID,
            },
            (response) => {
              sendResponse(response);
            },
          );
        }
      })();
      return true;
    } else if (message.type === 'GET_PAGE_INFO') {
      getPageInfo().then((info) => sendResponse(info));
      return true;
    }
    return true;
  });

  /**
   * Auto-collect on page load if on the target user's profile page
   */
  async function tryAutoCollect(): Promise<void> {
    // 0. Get config and check if target user is configured
    const response: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;
    const config = response.config;

    let targetXUsers = config.targetXUser;
    if (typeof targetXUsers === 'string') targetXUsers = [targetXUsers];

    if (!targetXUsers || targetXUsers.length === 0) {
      console.log('[Synapse] Target X user not configured, skipping auto-collect');
      return;
    }

    // 1. isTargetURL check
    if (!isTargetURL(targetXUsers)) {
      return;
    }

    // 2. Check interval
    const interval = config.collectIntervalHours ?? 4;
    const lastCollectForSource = config.lastCollectTimes?.x;
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;
    const now = Date.now();

    if (interval > 0 && lastCollect > 0) {
      const hoursSinceLast = (now - lastCollect) / (1000 * 60 * 60);
      if (hoursSinceLast < interval) {
        console.log(
          `[Synapse] Skipping auto-collect for X: last collect was ${hoursSinceLast.toFixed(2)} hours ago (interval: ${interval}h)`,
        );
        return;
      }
    }

    // 3. Get page elements (Wait for content to load)
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const tweets = findAllTweetsX();

    if (tweets.length === 0) {
      console.log('[Synapse] No tweets found to collect');
      return;
    }

    // 4. Parse and filter content
    const contentPromises = tweets.map((t) => collectTweetDataX(t));
    const resolvedContents = await Promise.all(contentPromises);
    const contents = resolvedContents.filter((data) => data.text && data.text.trim().length > 0);

    const filteredContents = filterByTargetUsers(contents, targetXUsers);
    const pageUID = getCurrentPageUserX();

    if (filteredContents.length === 0) {
      console.log('[Synapse] No matching tweets found to collect');
      return;
    }

    // 5. Send to background for saving
    chrome.runtime.sendMessage(
      {
        type: 'CONTENT_TO_BG_PROCESS',
        contents: filteredContents,
        pageUID,
        source: 'X',
      },
      (response) => {
        if (response?.success) {
          console.log(`[Synapse] Auto-collected ${response.collected} tweets successfully`);
        }
      },
    );
  }

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
  // Initialization logic
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'x' });
  tryAutoCollect();

  let lastUrl = window.location.href;

  // Listen for URL changes (for SPA navigation)
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      tryAutoCollect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
