/**
 * WXH (WeChat Official Account) Content Collector
 *
 * Collects the currently logged-in account's publish history from the WeChat MP
 * admin "发表记录" page:
 *   https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=0&count=10&token=...
 *
 * The page embeds the whole publish payload in an inline `publish_page` script
 * variable (background escapes quotes as `&quot;`). Content scripts run in an
 * isolated world and cannot read the page's `window`, so we read the payload out
 * of the <script> text instead and map each appmsg to a CollectedContent.
 */
(() => {
  const PUBLISH_PATH = '/cgi-bin/appmsgpublish';

  let cachedUserName: string | null = null;

  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------

  /**
   * Normalize a WeChat article URL to a stable canonical form using key params only.
   * Short-form /s/XXXXX URLs are returned as-is (query params stripped).
   */
  function normalizeWXHArticleUrl(url: string): string {
    if (!url) return url;
    try {
      const u = new URL(url);
      if (u.hostname !== 'mp.weixin.qq.com') return url;

      if (u.pathname.startsWith('/s/') && u.pathname.length > 3) {
        return `https://mp.weixin.qq.com${u.pathname}`;
      }

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

  // ---------------------------------------------------------------------------
  // Account info
  // ---------------------------------------------------------------------------

  function getAccountDisplayName(): string {
    const el = document.querySelector('.acount_box-nickname, .account_box-panel-head__nickname');
    if (el) {
      const text = (el as HTMLElement).innerText?.trim();
      if (text) return text;
    }
    return '';
  }

  function getAccountUserName(): string {
    if (cachedUserName !== null) return cachedUserName;
    cachedUserName = '';
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.indexOf('user_name') < 0) continue;
      const match = text.match(/\buser_name\s*:\s*["']([^"']+)["']/);
      if (match && match[1]) {
        cachedUserName = match[1];
        break;
      }
    }
    return cachedUserName;
  }

  // ---------------------------------------------------------------------------
  // Embedded publish payload extraction
  // ---------------------------------------------------------------------------

  /**
   * Given the index of an opening brace, return the balanced `{...}` substring,
   * tracking string literals so braces inside strings are ignored.
   */
  function extractBalancedObject(text: string, startBrace: number): string | null {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startBrace; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(startBrace, i + 1);
      }
    }

    return null;
  }

  function extractObjectForMarker(text: string, markerRe: RegExp): string | null {
    const match = markerRe.exec(text);
    if (!match) return null;
    const braceIndex = text.indexOf('{', match.index);
    if (braceIndex < 0) return null;
    return extractBalancedObject(text, braceIndex);
  }

  /**
   * Locate the raw JSON object literal of the publish payload from the inline
   * <script> tags. Prefers the unescaped `publish_page_noencode` variant.
   */
  function findPublishPayloadText(): string | null {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.indexOf('publish_page') < 0) continue;

      const raw =
        extractObjectForMarker(text, /\bpublish_page_noencode\s*=\s*\{/) ||
        extractObjectForMarker(text, /\bpublish_page\s*=\s*\{/);
      if (raw) return raw;
    }
    return null;
  }

  function decodeHtmlEntities(value: string): string {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }

  /**
   * Parse a `publish_info` value, which is normally a JSON string whose quotes
   * were HTML-escaped to `&quot;`.
   */
  function parsePublishInfo(value: any): any {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;

    for (const candidate of [value, decodeHtmlEntities(value)]) {
      try {
        return JSON.parse(candidate);
      } catch (_) { /* try next candidate */ }
    }
    return null;
  }

  function getPublishData(): any | null {
    const raw = findPublishPayloadText();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Field mapping
  // ---------------------------------------------------------------------------

  function toNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  }

  function unixToIso(value: any): string | null {
    const n = toNumber(value);
    if (n === undefined || n <= 0) return null;
    return new Date(n * 1000).toISOString();
  }

  function buildTimestamp(info: any, appmsg: any): string {
    const iso =
      unixToIso(appmsg?.line_info?.send_time) ||
      unixToIso(info?.publish_info?.create_time) ||
      unixToIso(info?.sent_info?.time) ||
      unixToIso(info?.sent_result?.update_time);
    return iso || new Date().toISOString();
  }

  function normalizeImageUrl(url: any): string {
    const value = String(url || '').trim();
    if (!value) return '';
    return value.replace(/^http:\/\//, 'https://');
  }

  function collectImages(appmsg: any): string[] {
    const images: string[] = [];
    const push = (url: any) => {
      const normalized = normalizeImageUrl(url);
      if (normalized && !images.includes(normalized)) images.push(normalized);
    };

    // Image posts (贴图) carry their pictures in share_imageinfo.
    const shareImages = Array.isArray(appmsg?.share_imageinfo) ? appmsg.share_imageinfo : [];
    for (const image of shareImages) {
      push(image?.cdn_url || image?.cover_url);
    }

    if (images.length === 0) {
      push(appmsg?.cover || appmsg?.pic_cdn_url_235_1 || appmsg?.pic_cdn_url_1_1);
    }

    return images;
  }

  function buildEngagement(appmsg: any): EngagementMetrics | undefined {
    const engagement: EngagementMetrics = {};
    const reads = toNumber(appmsg?.read_num);
    const likes = toNumber(appmsg?.old_like_num); // 点赞人数
    const comments = toNumber(appmsg?.comment_num);
    const reposts = toNumber(appmsg?.share_num); // 分享人数

    if (reads !== undefined) engagement.reads = reads;
    if (likes !== undefined) engagement.likes = likes;
    if (comments !== undefined) engagement.comments = comments;
    if (reposts !== undefined) engagement.reposts = reposts;

    return Object.keys(engagement).length > 0 ? engagement : undefined;
  }

  function buildTags(appmsg: any): string[] {
    const tags: string[] = [];
    const albumTitle = String(appmsg?.appmsg_album_info?.title || '').trim();
    if (albumTitle) tags.push(albumTitle);
    return tags;
  }

  function buildText(title: string, digest: string): string {
    const parts: string[] = [];
    if (title) parts.push(title);
    if (digest && digest !== title) parts.push(digest);
    return parts.join('\n\n').trim();
  }

  function appmsgToContent(info: any, appmsg: any, author: AuthorInfo): CollectedContent | null {
    const rawUrl = String(appmsg?.content_url || '').trim();
    if (!rawUrl) return null;

    const title = String(appmsg?.title || '').trim();
    const digest = String(appmsg?.digest || '').trim();
    const text = buildText(title, digest);
    if (!text) return null;

    const isImage = appmsg?.share_type === 8 || appmsg?.item_show_type === 8;

    return {
      source: 'WXH',
      type: isImage ? 'image' : 'article',
      text,
      images: collectImages(appmsg),
      videos: [],
      links: [],
      tags: buildTags(appmsg),
      timestamp: buildTimestamp(info, appmsg),
      url: normalizeWXHArticleUrl(rawUrl),
      author: { username: author.username, displayName: author.displayName },
      collectedAt: new Date().toISOString(),
      engagement: buildEngagement(appmsg),
    };
  }

  function resolveAuthor(data: any): AuthorInfo {
    let bizuin = '';
    const entries = Array.isArray(data?.publish_list) ? data.publish_list : [];
    for (const entry of entries) {
      const info = parsePublishInfo(entry?.publish_info);
      if (info?.publish_info?.bizuin) {
        bizuin = String(info.publish_info.bizuin);
        break;
      }
    }

    return {
      username: getAccountUserName() || bizuin || 'WXH',
      displayName: getAccountDisplayName() || 'WeChat',
    };
  }

  // ---------------------------------------------------------------------------
  // Collection
  // ---------------------------------------------------------------------------

  function findAllContent(): CollectedContent[] {
    const data = getPublishData();
    if (!data) return [];

    const author = resolveAuthor(data);
    const entries = Array.isArray(data.publish_list) ? data.publish_list : [];
    const seen = new Set<string>();
    const results: CollectedContent[] = [];

    for (const entry of entries) {
      const info = parsePublishInfo(entry?.publish_info);
      if (!info) continue;

      const appmsgs = Array.isArray(info.appmsg_info) ? info.appmsg_info : [];
      for (const appmsg of appmsgs) {
        const content = appmsgToContent(info, appmsg, author);
        if (!content) continue;
        if (seen.has(content.url)) continue;
        seen.add(content.url);
        results.push(content);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Page detection
  // ---------------------------------------------------------------------------

  function isPublishPage(): boolean {
    return (
      window.location.hostname === 'mp.weixin.qq.com' &&
      window.location.pathname.indexOf(PUBLISH_PATH) === 0
    );
  }

  async function getPageInfo(): Promise<PageInfo> {
    if (!isPublishPage()) {
      return {
        isTargetPage: false,
        itemCount: 0,
        currentUrl: window.location.href,
      };
    }

    const data = getPublishData();
    const content = findAllContent();

    return {
      isTargetPage: true,
      itemCount: content.length,
      currentUrl: window.location.href,
      pageIdentifier: getAccountUserName() || getAccountDisplayName(),
      accountName: getAccountDisplayName(),
      totalCount: toNumber(data?.total_count),
    };
  }

  // ---------------------------------------------------------------------------
  // Auto-collect
  // ---------------------------------------------------------------------------

  async function tryAutoCollect(): Promise<void> {
    if (!isPublishPage()) return;

    const response: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });

    const config = response?.config;
    if (!config) return;

    const enabledSources: string[] = config.enabledSources || [];
    if (!enabledSources.includes('wxh')) {
      console.log('[Synapse] WXH auto-collect disabled');
      return;
    }

    const interval = config.collectIntervalMinutes ?? 240;
    const lastCollectForSource = config.lastCollectTimes?.wxh;
    const lastCollect = lastCollectForSource ? new Date(lastCollectForSource).getTime() : 0;

    if (interval > 0 && lastCollect > 0) {
      const minsSinceLast = (Date.now() - lastCollect) / (1000 * 60);
      if (minsSinceLast < interval) {
        console.log(
          `[Synapse] Skipping auto-collect for WXH: last collect was ${minsSinceLast.toFixed(2)} mins ago (interval: ${interval}m)`,
        );
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const contents = findAllContent();
    if (contents.length === 0) {
      console.log('[Synapse] No WXH publish records found to collect');
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'CONTENT_TO_BG_PROCESS', contents, pageUID: getAccountUserName() },
      (result) => {
        if (result?.success) {
          console.log(`[Synapse] WXH auto-collected ${result.collected} items`);
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
        if (!isPublishPage()) {
          sendResponse({ success: false, error: 'Not a WXH publish records page' });
          return true;
        }

        const contents = findAllContent();
        if (contents.length === 0) {
          sendResponse({ success: false, error: 'No publish records found on page' });
          return true;
        }

        chrome.runtime.sendMessage(
          { type: 'CONTENT_TO_BG_PROCESS', contents, pageUID: getAccountUserName() },
          (response) => sendResponse(response),
        );
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

  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      tryAutoCollect();
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
