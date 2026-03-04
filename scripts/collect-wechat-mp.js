/**
 * WeChat MP Article Collector
 *
 * Fetches articles from a WeChat public account album page and saves them to Notion.
 *
 * Reads config from scripts/.env:
 *   NOTION_TOKEN, NOTION_DATABASE_ID, WECHAT_ALBUM_URL
 *
 * Usage:
 *   node scripts/collect-wechat-mp.js [--dry-run] [--limit N]
 */

import { Client } from '@notionhq/client';
import { createHash } from 'crypto';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// Load .env from scripts/ directory
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

// --- CLI args ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// --- Config ---
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const albumUrl = process.env.WECHAT_ALBUM_URL;

if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('Missing required env vars: NOTION_TOKEN, NOTION_DATABASE_ID');
  process.exit(1);
}

if (!albumUrl) {
  console.error('Missing WECHAT_ALBUM_URL in .env');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// --- Cache ---
const CACHE_DIR = resolve(__dirname, '.cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR);

function cacheGet(url) {
  const file = resolve(CACHE_DIR, hashUrl(url) + '.html');
  if (existsSync(file)) return readFileSync(file, 'utf-8');
  return null;
}

function cacheSet(url, html) {
  const file = resolve(CACHE_DIR, hashUrl(url) + '.html');
  writeFileSync(file, html, 'utf-8');
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://mp.weixin.qq.com/',
};

// --- Helpers ---

function hashUrl(url) {
  return createHash('sha256').update(url).digest('hex');
}

function truncate(text, maxLen = 20) {
  if (!text) return '';
  return text.length <= maxLen ? text : text.substring(0, maxLen) + '...';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse Chinese date string like "2021年12月25日 20:02" to ISO string
 */
function parseChineseDate(str) {
  if (!str) return new Date().toISOString();
  const normalized = str
    .trim()
    .replace('年', '-')
    .replace('月', '-')
    .replace('日', '')
    .trim();
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Strip HTML tags and collapse whitespace
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url, { useCache = true } = {}) {
  if (useCache) {
    const cached = cacheGet(url);
    if (cached) {
      console.log(`  [cache] ${url.substring(0, 80)}...`);
      return cached;
    }
  }
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  cacheSet(url, html);
  return html;
}

// --- Parse album list page ---

function parseAlbumPage(html) {
  const articles = [];
  // Match <li ... data-link="..." data-title="..." ...>
  const liRegex = /<li\s[^>]*?data-link="([^"]+)"[^>]*?data-title="([^"]+)"[^>]*?>/g;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    const link = match[1].replace(/&amp;/g, '&');
    const title = match[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    articles.push({ url: link, title });
  }
  return articles;
}

function parseAlbumMeta(html) {
  const articleCountMatch = html.match(/article_count:\s*'(\d+)'\s*\*\s*1/);
  const continueFlagMatch = html.match(/continue_flag:\s*'(\d+)'\s*\*\s*1/);
  return {
    articleCount: articleCountMatch ? parseInt(articleCountMatch[1], 10) : null,
    continueFlag: continueFlagMatch ? parseInt(continueFlagMatch[1], 10) : null,
  };
}

function parseAlbumIdentifiers(albumUrl, html = '') {
  let biz = '';
  let albumId = '';

  try {
    const u = new URL(albumUrl);
    biz = u.searchParams.get('__biz') || '';
    albumId = u.searchParams.get('album_id') || '';
  } catch (_) {
    // Ignore malformed URL and fallback to regex parsing below.
  }

  if (!biz) {
    const bizMatch = html.match(/__biz=([^&'"]+)/);
    if (bizMatch) biz = bizMatch[1];
  }
  if (!albumId) {
    const albumMatch = html.match(/album[_]?id['"]?\s*[:=]\s*['"](\d+)['"]/i);
    if (albumMatch) albumId = albumMatch[1];
  }

  return { biz, albumId };
}

function parseCursorFromArticleUrl(articleUrl) {
  if (!articleUrl) return null;
  try {
    const normalizedUrl = articleUrl.replace(/^http:\/\//, 'https://');
    const u = new URL(normalizedUrl);
    const msgid = u.searchParams.get('mid') || u.searchParams.get('msgid');
    const itemidx = u.searchParams.get('idx') || u.searchParams.get('itemidx') || '1';
    if (!msgid || !itemidx) return null;
    return { msgid, itemidx };
  } catch (_) {
    return null;
  }
}

function normalizeArticleFromApi(item) {
  const url = (item?.url || '').replace(/&amp;/g, '&');
  const title = (item?.title || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  return { url, title };
}

function buildAlbumApiUrl({ biz, albumId, beginMsgid, beginItemidx, count = 10 }) {
  const params = new URLSearchParams({
    action: 'getalbum',
    __biz: biz,
    album_id: albumId,
    count: String(count),
    begin_msgid: String(beginMsgid),
    begin_itemidx: String(beginItemidx),
    f: 'json',
  });
  return `https://mp.weixin.qq.com/mp/appmsgalbum?${params.toString()}`;
}

async function fetchAlbumApiBatch({ biz, albumId, beginMsgid, beginItemidx, count = 10 }) {
  const apiUrl = buildAlbumApiUrl({ biz, albumId, beginMsgid, beginItemidx, count });
  const raw = await fetchHtml(apiUrl, { useCache: true });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    throw new Error(`Album pagination API returned non-JSON: ${apiUrl}`);
  }

  const ret = Number(payload?.base_resp?.ret ?? -1);
  if (ret !== 0) {
    throw new Error(`Album pagination API returned ret=${ret}`);
  }

  let list = payload?.getalbum_resp?.article_list || [];
  if (!Array.isArray(list)) list = list ? [list] : [];

  return {
    articles: list.map(normalizeArticleFromApi).filter((a) => a.url),
    continueFlag: Number(payload?.getalbum_resp?.continue_flag) === 1,
  };
}

async function fetchAllAlbumArticles(albumHtml, initialArticles) {
  const meta = parseAlbumMeta(albumHtml);
  const { biz, albumId } = parseAlbumIdentifiers(albumUrl, albumHtml);

  const expectedCount = meta.articleCount;
  const initialContinue =
    (meta.continueFlag !== null ? meta.continueFlag === 1 : false) ||
    (Number.isInteger(expectedCount) && expectedCount > initialArticles.length);

  if (!initialContinue) {
    return { articles: initialArticles, expectedCount };
  }

  if (!biz || !albumId) {
    console.warn('Could not parse __biz/album_id for pagination. Using first-page articles only.');
    return { articles: initialArticles, expectedCount };
  }

  const deduped = [];
  const seen = new Set();
  const addArticle = (article) => {
    const normalized = normalizeArticleFromApi(article);
    if (!normalized.url) return false;
    const h = hashUrl(normalized.url);
    if (seen.has(h)) return false;
    seen.add(h);
    deduped.push(normalized);
    return true;
  };

  initialArticles.forEach(addArticle);

  let canContinue = true;
  let page = 0;
  const MAX_PAGES = 50;

  while (canContinue && page < MAX_PAGES) {
    const lastArticle = deduped[deduped.length - 1];
    const cursor = parseCursorFromArticleUrl(lastArticle?.url || '');
    if (!cursor) {
      console.warn('Pagination stopped: cannot parse cursor from last article URL.');
      break;
    }

    page++;
    console.log(`Fetching album page ${page + 1} via API...`);
    const batch = await fetchAlbumApiBatch({
      biz,
      albumId,
      beginMsgid: cursor.msgid,
      beginItemidx: cursor.itemidx,
      count: 10,
    });

    let added = 0;
    for (const item of batch.articles) {
      if (addArticle(item)) added++;
    }
    console.log(`  API batch: ${batch.articles.length}, new unique: ${added}`);

    canContinue = batch.continueFlag;
    if (batch.articles.length === 0) break;

    if (Number.isInteger(expectedCount) && deduped.length >= expectedCount) {
      canContinue = false;
    }
  }

  if (page >= MAX_PAGES) {
    console.warn(`Reached pagination safety limit (${MAX_PAGES} pages).`);
  }

  return { articles: deduped, expectedCount };
}

// --- Parse article content page ---

function parseArticlePage(html) {
  // Title: <h1 id="activity-name"> ... <span class="js_title_inner">TEXT</span>
  let title = '';
  const titleSpanMatch = html.match(/<span[^>]*class="js_title_inner"[^>]*>([\s\S]*?)<\/span>/);
  if (titleSpanMatch) {
    title = stripHtml(titleSpanMatch[1]);
  } else {
    // Fallback: content inside <h1 id="activity-name">
    const h1Match = html.match(/<h1[^>]*id="activity-name"[^>]*>([\s\S]*?)<\/h1>/);
    if (h1Match) title = stripHtml(h1Match[1]);
  }

  // Publish time: extracted from JS variable (more reliable than dynamic #publish_time DOM)
  // Tries: createTime = 'YYYY-MM-DD HH:mm', then oriCreateTime unix timestamp, then #publish_time
  let timestamp = new Date().toISOString();
  const createTimeMatch = html.match(/var\s+createTime\s*=\s*['"]([^'"]+)['"]/);
  const oriCreateTimeMatch = html.match(/var\s+oriCreateTime\s*=\s*['"](\d+)['"]/);
  const pubMatch = html.match(/<em[^>]*id="publish_time"[^>]*>([\s\S]*?)<\/em>/);
  if (createTimeMatch) {
    const d = new Date(createTimeMatch[1]);
    if (!isNaN(d.getTime())) timestamp = d.toISOString();
  } else if (oriCreateTimeMatch) {
    timestamp = new Date(parseInt(oriCreateTimeMatch[1], 10) * 1000).toISOString();
  } else if (pubMatch) {
    timestamp = parseChineseDate(stripHtml(pubMatch[1]));
  }

  // Author: <meta property="og:article:author" content="NAME">
  let author = 'WeChat';
  const authorMatch = html.match(/property="og:article:author"\s+content="([^"]+)"/);
  if (authorMatch) {
    author = authorMatch[1];
  }

  // Content: <div ... id="js_content" ...>...</div>
  // The content div is on one line in the minified HTML
  let text = '';
  const contentMatch = html.match(/id="js_content"[^>]*>([\s\S]*?)<\/div>/);
  if (contentMatch) {
    text = stripHtml(contentMatch[1]);
  }

  return { title, timestamp, author, text };
}

// --- Notion deduplication ---

async function getExistingHashes(hashes) {
  if (hashes.length === 0) return new Set();

  // Notion filter: OR across all hashes (max 100 per query)
  const existing = new Set();
  const BATCH = 100;

  for (let i = 0; i < hashes.length; i += BATCH) {
    const batch = hashes.slice(i, i + BATCH);
    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        or: batch.map((h) => ({
          property: 'HashID',
          rich_text: { equals: h },
        })),
      },
      page_size: BATCH,
    });

    for (const page of response.results) {
      const hashProp = page.properties?.HashID?.rich_text?.[0]?.plain_text;
      if (hashProp) existing.add(hashProp);
    }
  }

  return existing;
}

// --- Save to Notion ---

function createRichText(content) {
  const MAX = 2000;
  const chunks = [];
  for (let i = 0; i < content.length; i += MAX) {
    chunks.push({ type: 'text', text: { content: content.substring(i, i + MAX) } });
  }
  return chunks;
}

async function saveToNotion(article) {
  const { url, title, text, timestamp, author } = article;
  const urlHash = hashUrl(url);
  const displayTitle = title || truncate(text, 20) || urlHash;

  const properties = {
    Title: {
      title: [{ text: { content: truncate(displayTitle, 20) } }],
    },
    HashID: {
      rich_text: [{ type: 'text', text: { content: urlHash } }],
    },
    Type: {
      select: { name: 'article' },
    },
    Source: {
      select: { name: '公众号' },
    },
    OriginalURL: {
      url: url,
    },
    OriginalDate: {
      date: { start: timestamp },
    },
    Status: {
      select: { name: 'Published' },
    },
  };

  const children = [];
  if (text) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: createRichText(text) },
    });
  }

  await notion.pages.create({
    parent: { database_id: NOTION_DATABASE_ID },
    properties,
    children,
  });

  console.log(`  ✓ Saved: ${displayTitle}`);
}

// --- Main ---

async function main() {
  console.log(`WeChat MP Collector`);
  console.log(`Album URL: ${albumUrl}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Limit: ${limit === Infinity ? 'none' : limit}`);
  console.log('');

  // 1. Fetch album page
  console.log('Fetching album page...');
  let albumHtml;
  try {
    albumHtml = await fetchHtml(albumUrl);
  } catch (err) {
    console.error('Failed to fetch album page:', err.message);
    process.exit(1);
  }

  // 2. Parse article list
  let articles = parseAlbumPage(albumHtml);
  if (articles.length === 0) {
    console.error('No articles found. The page may require login or the HTML structure has changed.');
    process.exit(1);
  }

  // Fetch remaining pages via album API when available.
  try {
    const { articles: allArticles, expectedCount } = await fetchAllAlbumArticles(albumHtml, articles);
    articles = allArticles;
    if (Number.isInteger(expectedCount)) {
      console.log(`Found ${articles.length} articles in album (expected around ${expectedCount})`);
    } else {
      console.log(`Found ${articles.length} articles in album`);
    }
  } catch (err) {
    console.warn(`Failed to fetch paginated album entries: ${err.message}`);
    console.log(`Found ${articles.length} articles in album (first page only)`);
  }

  // Apply limit
  if (articles.length > limit) {
    articles = articles.slice(0, limit);
    console.log(`Limited to ${limit} articles`);
  }

  // 3. Deduplicate
  console.log('Checking for existing entries in Notion...');
  const hashes = articles.map((a) => hashUrl(a.url));
  const existingHashes = await getExistingHashes(hashes);
  const newArticles = articles.filter((a) => !existingHashes.has(hashUrl(a.url)));
  console.log(`New: ${newArticles.length}, Already in Notion: ${articles.length - newArticles.length}`);

  if (newArticles.length === 0) {
    console.log('Nothing new to collect.');
    return;
  }

  // 4. Fetch and save each new article
  console.log('');
  let saved = 0;
  let failed = 0;

  for (const article of newArticles) {
    console.log(`Processing: ${article.title}`);

    if (dryRun) {
      console.log(`  [dry-run] Would fetch: ${article.url}`);
      continue;
    }

    try {
      // Only delay on actual network fetch, not cache hits
      if (!cacheGet(article.url)) await delay(1000);
      const html = await fetchHtml(article.url);
      const parsed = parseArticlePage(html);

      // Use album title as fallback if article page title is empty
      const title = parsed.title || article.title;
      const text = parsed.text;
      const timestamp = parsed.timestamp;
      const author = parsed.author;

      console.log(`  Title: ${title}`);
      console.log(`  Author: ${author}, Date: ${timestamp}`);
      console.log(`  Content length: ${text.length} chars`);

      await saveToNotion({ url: article.url, title, text, timestamp, author });
      saved++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Saved: ${saved}, Failed: ${failed}, Skipped (duplicates): ${articles.length - newArticles.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
