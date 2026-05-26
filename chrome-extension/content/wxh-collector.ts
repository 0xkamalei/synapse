/**
 * WXH (WeChat Official Account) Content Collector
 * Extracts article list from WeChat public account album pages,
 * and engagement metrics from article detail pages.
 *
 * Collection strategy:
 * - Album page: DOM provides the full article set; cgiData provides precise timestamps.
 * - Detail page: auto-collect engagement (reads, likes) when article's __biz matches a
 *   configured target album.
 *
 * URL normalization: article URLs are normalized to __biz+mid+idx+sn for consistent hashing.
 */
(() => {
  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------

  /**
   * Normalize a WeChat article URL to a stable canonical form using key params only.
   * Removes volatile params (key, chksm, scene, etc.).
   * Short-form /s/XXXXX URLs are returned as-is.
   */
  function normalizeWXHArticleUrl(url: string): string {
    if (!url) return url;
    try {
      const u = new URL(url);
      if (u.hostname !== 'mp.weixin.qq.com') return url;

      // Short-form: /s/XXXXX — already stable
      if (u.pathname.startsWith('/s/') && u.pathname.length > 3) {
        return `https://mp.weixin.qq.com${u.pathname}`;
      }

      // Long-form: extract stable params
      const biz = u.searchParams.get('__biz');
      const mid = u.searchParams.get('mid');
      const idx = u.searchParams.get('idx');
      const sn = u.searchParams.get('sn');

      if (biz && mid && idx && sn) {
        return `https://mp.weixin.qq.com/s?__biz=${encodeURIComponent(biz)}&mid=${mid}&idx=${idx}&sn=${sn}`;
      }
      if (biz && mid && idx) {
        return `https://mp.weixin.qq.com/s?__biz=${encodeURIComponent(biz)}&mid=${mid}&idx=${idx}`;
      }
    } catch (_) { /* ignore */ }
    return url;
  }

  /**
   * Extract __biz from a WeChat article or album URL.
   */
  function getBizFromUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.searchParams.get('__biz') || '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Check if the given __biz belongs to any of the configured target album URLs.
   */
  function isTargetBiz(targetAlbums: string[], biz: string): boolean {
    if (!biz || !targetAlbums?.length) return false;
    return targetAlbums.some((albumUrl) => {
      const albumBiz = getBizFromUrl(albumUrl);
      return albumBiz && albumBiz === biz;
    });
  }

  // ---------------------------------------------------------------------------
  // Time parsing (shared)
  // ---------------------------------------------------------------------------

  /**
   * Parse creation time string (unix timestamp as string) to ISO format.
   */
  function parseCreateTime(createTime: string): string {
    if (!createTime) return new Date().toISOString();
    const ts = parseInt(createTime, 10);
    if (!isNaN(ts) && ts > 0) {
      return new Date(ts * 1000).toISOString();
    }
    return new Date().toISOString();
  }

  /**
   * Parse time display text from WeChat article list.
   */
  function parseTimeText(timeText: string): string {
    if (!timeText) return new Date().toISOString();
    const now = new Date();
    const text = timeText.trim();
    const lower = text.toLowerCase();

    const weekMatch = lower.match(/(\d+)\s*weeks?\s*ago/);
    if (weekMatch) {
      const d = new Date(now);
      d.setDate(d.getDate() - parseInt(weekMatch[1], 10) * 7);
      d.setSeconds(0, 0);
      return d.toISOString();
    }

    const dayMatch = lower.match(/(\d+)\s*days?\s*ago/);
    if (dayMatch) {
      const d = new Date(now);
      d.setDate(d.getDate() - parseInt(dayMatch[1], 10));
      d.setSeconds(0, 0);
      return d.toISOString();
    }

    if (lower.includes('yesterday') || text.includes('昨天')) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    }

    const hourMatch = lower.match(/(\d+)\s*(?:hours?\s*ago|小时前)/);
    if (hourMatch) {
      const d = new Date(now);
      d.setHours(d.getHours() - parseInt(hourMatch[1], 10));
      d.setSeconds(0, 0);
      return d.toISOString();
    }

    const fullDateMatch = text.match(/^(\d{4})Year(\d{1,2})Month(\d{1,2})Day$/);
    if (fullDateMatch) {
      return new Date(
        parseInt(fullDateMatch[1], 10),
        parseInt(fullDateMatch[2], 10) - 1,
        parseInt(fullDateMatch[3], 10),
        12, 0, 0,
      ).toISOString();
    }

    const fullDateCNMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
    if (fullDateCNMatch) {
      return new Date(
        parseInt(fullDateCNMatch[1], 10),
        parseInt(fullDateCNMatch[2], 10) - 1,
        parseInt(fullDateCNMatch[3], 10),
        12, 0, 0,
      ).toISOString();
    }

    const mdMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mdMatch) {
      const month = parseInt(mdMatch[1], 10);
      const day = parseInt(mdMatch[2], 10);
      let year = now.getFullYear();
      if (month > now.getMonth() + 1) year -= 1;
      return new Date(year, month - 1, day, 12, 0, 0).toISOString();
    }

    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
  }

  // ---------------------------------------------------------------------------
  // Album page helpers
  // ---------------------------------------------------------------------------

  function getPageAccountId(): string {
    try {
      const cgiData = (window as any).cgiData;
      if (cgiData?.user_name) return cgiData.user_name;
    } catch (_) { /* ignore */ }
    return '';
  }

  function getPageDisplayName(): string {
    try {
      const cgiData = (window as any).cgiData;
      if (cgiData?.nick_name) return cgiData.nick_name;
    } catch (_) { /* ignore */ }
    const nickEl = document.querySelector('.album__author-name');
    if (nickEl) return (nickEl as HTMLElement).innerText?.trim() || '';
    return 'WeChat';
  }

  function extractWXHAuthor(): AuthorInfo {
    const accountId = getPageAccountId();
    const displayName = getPageDisplayName();
    return {
      username: accountId || displayName,
      displayName: displayName,
    };
  }

  function getArticleListFromCgiData(): any[] {
    try {
      const cgiData = (window as any).cgiData;
      if (cgiData?.articleList && Array.isArray(cgiData.articleList)) {
        return cgiData.articleList;
      }
    } catch (_) { /* ignore */ }
    return [];
  }

  function findAllArticlesWXH(): Element[] {
    return Array.from(document.querySelectorAll('li.album__list-item.js_album_item'));
  }

  function collectArticleDataWXH(el: Element, cgiTimestamp?: string): CollectedContent {
    const link = el.getAttribute('data-link') || '';
    const rawTitle = el.getAttribute('data-title') || '';

    const rawUrl = link.replace(/&amp;/g, '&');
    const url = normalizeWXHArticleUrl(rawUrl);
    const title = rawTitle
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');

    let timestamp: string;
    if (cgiTimestamp) {
      timestamp = cgiTimestamp;
    } else {
      timestamp = new Date().toISOString();
      const timeEl = el.querySelector('.js_article_create_time');
      if (timeEl) {
        const timeText = (timeEl as HTMLElement).innerText?.trim() || '';
        timestamp = parseTimeText(timeText);
      }
    }

    const author = extractWXHAuthor();

    return {
      source: 'WXH',
      type: 'article',
      text: title,
      images: [],
      videos: [],
      links: [],
      timestamp,
      url,
      author: { username: author.username, displayName: author.displayName },
      collectedAt: new Date().toISOString(),
    };
  }

  function findAllContent(): CollectedContent[] {
    const cgiTimestampMap = new Map<string, string>();
    const cgiArticles = getArticleListFromCgiData();
    for (const item of cgiArticles) {
      if (item.msgid && item.create_time) {
        cgiTimestampMap.set(String(item.msgid), parseCreateTime(item.create_time));
      }
    }

    const domItems = findAllArticlesWXH();
    const seen = new Set<string>();
    const results: CollectedContent[] = [];

    for (const el of domItems) {
      const msgid = el.getAttribute('data-msgid') || '';
      const rawUrl = (el.getAttribute('data-link') || '').replace(/&amp;/g, '&');
      const url = normalizeWXHArticleUrl(rawUrl);

      if (seen.has(url)) continue;
      seen.add(url);

      const cgiTimestamp = cgiTimestampMap.get(msgid);
      const content = collectArticleDataWXH(el, cgiTimestamp);
      if (content.text && content.text.trim().length > 0) {
        results.push(content);
      }
    }

    return results;
  }

  function isAlbumPage(): boolean {
    return (
      window.location.hostname === 'mp.weixin.qq.com' &&
      (window.location.pathname.includes('/mp/appmsgalbum') ||
        !!document.querySelector('.album__list-item'))
    );
  }

  // ---------------------------------------------------------------------------
  // Article detail page helpers
  // ---------------------------------------------------------------------------

  function isArticleDetailPage(): boolean {
    if (window.location.hostname !== 'mp.weixin.qq.com') return false;
    // Matches /s/XXXXX or ?__biz=...&mid=...
    const hasDetailPath =
      (window.location.pathname.startsWith('/s/') && window.location.pathname.length > 3) ||
      (window.location.search.includes('__biz=') && window.location.search.includes('mid='));
    if (!hasDetailPath) return false;
    // Check that article content exists in the DOM
    return !!(
      document.querySelector('#js_content') ||
      document.querySelector('.rich_media_content') ||
      document.querySelector('#activity-name')
    );
  }

  /**
   * Parse a text number that may include 万/千/亿.
   */
  function parseWXHCount(text: string): number | undefined {
    if (!text) return undefined;
    const clean = text.trim().replace(/,/g, '').replace(/\s+/g, '');
    if (!clean) return undefined;

    const wan = clean.match(/^([\d.]+)万[+]?$/);
    if (wan) return Math.round(parseFloat(wan[1]) * 10000);

    const qian = clean.match(/^([\d.]+)千[+]?$/);
    if (qian) return Math.round(parseFloat(qian[1]) * 1000);

    const n = parseInt(clean, 10);
    return isNaN(n) ? undefined : n;
  }

  /**
   * Extract engagement metrics from a WeChat article detail page.
   * Selectors are tried in order of reliability.
   */
  function collectDetailEngagementWXH(): EngagementMetrics {
    const engagement: EngagementMetrics = {};

    // Read count
    const readSelectors = ['#readNum', '#js_read_cnt em', '.read_num', '#js_read_cnt'];
    for (const sel of readSelectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) {
        const reads = parseWXHCount(el.innerText?.trim() || '');
        if (reads !== undefined) {
          engagement.reads = reads;
          break;
        }
      }
    }

    // Like / "好看" count
    const likeSelectors = [
      '#js_like_count',
      '#likeNum',
      '#js_mplike_count',
      '.like_num',
      '#js_like_btn_count',
    ];
    for (const sel of likeSelectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) {
        const likes = parseWXHCount(el.innerText?.trim() || '');
        if (likes !== undefined) {
          engagement.likes = likes;
          break;
        }
      }
    }

    return engagement;
  }

  /**
   * Collect full article data from a detail page (title, author, date, engagement).
   */
  function collectArticleDetailData(): CollectedContent | null {
    const url = normalizeWXHArticleUrl(window.location.href);

    // Title
    let title = '';
    const titleEl =
      document.querySelector('#activity-name .js_title_inner') ||
      document.querySelector('#activity-name') ||
      document.querySelector('.rich_media_title');
    if (titleEl) title = (titleEl as HTMLElement).innerText?.trim() || '';
    if (!title) {
      title = document.title?.replace(/\s*-\s*微信.*$/, '').trim() || '';
    }

    if (!title) return null;

    // Timestamp
    let timestamp = new Date().toISOString();
    const tsMatch =
      document.documentElement.innerHTML.match(/var\s+createTime\s*=\s*['"]([^'"]+)['"]/) ||
      document.documentElement.innerHTML.match(/var\s+oriCreateTime\s*=\s*['"](\d+)['"]/);
    if (tsMatch) {
      const raw = tsMatch[1];
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num > 1e9) {
        timestamp = new Date(num * 1000).toISOString();
      } else {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) timestamp = d.toISOString();
      }
    } else {
      const pubEl = document.querySelector('#publish_time') as HTMLElement;
      if (pubEl) timestamp = parseTimeText(pubEl.innerText?.trim() || '');
    }

    // Author display name (from og meta or account name element)
    let displayName = 'WeChat';
    const authorMeta = document.querySelector('meta[property="og:article:author"]');
    if (authorMeta) displayName = authorMeta.getAttribute('content') || displayName;
    else {
      const nameEl = document.querySelector('#js_name') as HTMLElement;
      if (nameEl) displayName = nameEl.innerText?.trim() || displayName;
    }

    const biz = getBizFromUrl(window.location.href);
    const engagement = collectDetailEngagementWXH();

    return {
      source: 'WXH',
      type: 'article',
      text: title,
      images: [],
      videos: [],
      links: [],
      timestamp,
      url,
      author: { username: biz || displayName, displayName },
      collectedAt: new Date().toISOString(),
      engagement: Object.keys(engagement).length > 0 ? engagement : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Page info
  // ---------------------------------------------------------------------------

  async function getPageInfo(): Promise<PageInfo> {
    if (isAlbumPage()) {
      const accountId = getPageAccountId();
      const content = findAllContent();
      return {
        isTargetPage: true,
        itemCount: content.length,
        currentUrl: window.location.href,
        pageIdentifier: accountId,
      };
    }

    if (isArticleDetailPage()) {
      const biz = getBizFromUrl(window.location.href);
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
      });
      const targetAlbums: string[] = response?.config?.targetWxhAlbum || [];
      const isTarget = isTargetBiz(targetAlbums, biz);
      return {
        isTargetPage: isTarget,
        itemCount: isTarget ? 1 : 0,
        currentUrl: window.location.href,
        pageIdentifier: biz,
      };
    }

    return {
      isTargetPage: false,
      itemCount: 0,
      currentUrl: window.location.href,
    };
  }

  // ---------------------------------------------------------------------------
  // Auto-collect: album page
  // ---------------------------------------------------------------------------

  async function tryAutoCollect(): Promise<void> {
    if (!isAlbumPage()) return;

    const response: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;
    const config = response.config;

    const interval = config.collectIntervalMinutes ?? 240;
    const lastCollectForSource = config.lastCollectTimes?.wxh;
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;
    const now = Date.now();

    if (interval > 0 && lastCollect > 0) {
      const minsSinceLast = (now - lastCollect) / (1000 * 60);
      if (minsSinceLast < interval) {
        console.log(
          `[Synapse] Skipping auto-collect for WXH: last collect was ${minsSinceLast.toFixed(2)} mins ago (interval: ${interval}m)`,
        );
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const allContent = findAllContent();
    if (allContent.length === 0) {
      console.log('[Synapse] No WXH articles found to collect');
      return;
    }

    const accountId = getPageAccountId();

    chrome.runtime.sendMessage(
      { type: 'CONTENT_TO_BG_PROCESS', contents: allContent, pageUID: accountId },
      (response) => {
        if (response?.success) {
          console.log(`[Synapse] WXH auto-collected ${response.collected} items`);
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auto-collect: article detail page (engagement update)
  // ---------------------------------------------------------------------------

  async function tryAutoCollectDetail(): Promise<void> {
    if (!isArticleDetailPage()) return;

    const biz = getBizFromUrl(window.location.href);
    if (!biz) return;

    const response: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    if (!response || !response.config) return;
    const targetAlbums: string[] = response.config.targetWxhAlbum || [];

    if (!isTargetBiz(targetAlbums, biz)) {
      return; // Not a configured account
    }

    // Wait for engagement numbers to render (loaded via JS/AJAX)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const content = collectArticleDetailData();
    if (!content) return;

    chrome.runtime.sendMessage(
      { type: 'CONTENT_TO_BG_PROCESS', contents: [content], pageUID: biz },
      (response) => {
        if (response?.success) {
          console.log(`[Synapse] WXH detail upserted: ${content.text}`);
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Message listeners
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener(
    (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === 'POP_TO_CONTENT_COLLECT') {
        if (isAlbumPage()) {
          const accountId = getPageAccountId();
          const allContent = findAllContent();
          if (allContent.length === 0) {
            sendResponse({ success: false, error: 'No articles found on page' });
            return true;
          }
          chrome.runtime.sendMessage(
            { type: 'CONTENT_TO_BG_PROCESS', contents: allContent, pageUID: accountId },
            (response) => sendResponse(response),
          );
          return true;
        }

        if (isArticleDetailPage()) {
          const content = collectArticleDetailData();
          if (!content) {
            sendResponse({ success: false, error: 'Could not collect detail page' });
            return true;
          }
          const biz = getBizFromUrl(window.location.href);
          chrome.runtime.sendMessage(
            { type: 'CONTENT_TO_BG_PROCESS', contents: [content], pageUID: biz },
            (response) => sendResponse(response),
          );
          return true;
        }

        sendResponse({ success: false, error: 'Not a recognized WXH page' });
        return true;
      }

      if (message.type === 'GET_PAGE_INFO') {
        getPageInfo().then((info) => sendResponse(info));
        return true;
      }

      return true;
    },
  );

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'wxh' });
  tryAutoCollect();
  tryAutoCollectDetail();

  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      tryAutoCollect();
      tryAutoCollectDetail();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
