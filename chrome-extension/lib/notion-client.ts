/**
 * Notion Client
 * Handles saving content to Notion database
 */

import { getConfig } from './storage.js';
import { logger } from './logger.js';
import { hashCache } from './hash-cache.js';

const NOTION_API_VERSION = '2025-09-03';
const NOTION_API_BASE = 'https://api.notion.com/v1';

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Create rich text array for Notion
 */
function createRichText(content: string) {
  if (!content) return [];

  const MAX_LENGTH = 2000;
  const chunks: any[] = [];

  for (let i = 0; i < content.length; i += MAX_LENGTH) {
    chunks.push({
      type: 'text',
      text: { content: content.substring(i, i + MAX_LENGTH) },
    });
  }

  return chunks;
}

/**
 * Generate a stable hash for a URL
 */
export async function hashUrl(url: string): Promise<string> {
  if (!url) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Save content to Notion database
 */
export async function saveToNotion(content: CollectedContent): Promise<any> {
  const config = await getConfig();

  if (!config.notionToken || !config.notionDataSourceId) {
    throw new Error('Notion configuration incomplete (Token or Data Source ID missing)');
  }

  const urlHash = await hashUrl(content.url);

  // Build page properties
  const properties: any = {
    Title: {
      title: [
        {
          text: {
            content: truncateText(content.text, 20) || urlHash,
          },
        },
      ],
    },
    HashID: {
      rich_text: [
        {
          type: 'text',
          text: { content: urlHash },
        },
      ],
    },
    Type: {
      select: { name: content.type || 'text' },
    },
    Source: {
      select: { name: content.source },
    },
    OriginalURL: {
      url: content.url,
    },
    OriginalDate: {
      date: { start: content.timestamp || new Date().toISOString() },
    },
    Status: {
      select: { name: 'Published' },
    },
  };

  // Add tags if present
  if (content.tags && content.tags.length > 0) {
    properties.Tags = {
      multi_select: content.tags.map((tag) => ({ name: tag })),
    };
  }

  // Build page children (content blocks)
  const children: any[] = [];

  if (content.text) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: createRichText(content.text),
      },
    });
  }

  if (content.images && content.images.length > 0) {
    for (const imageUrl of content.images) {
      children.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: imageUrl },
        },
      });
    }
  }

  if (content.videos && content.videos.length > 0) {
    for (const videoUrl of content.videos) {
      children.push({
        object: 'block',
        type: 'video',
        video: {
          type: 'external',
          external: { url: videoUrl },
        },
      });
    }
  }

  const payload = {
    parent: { data_source_id: config.notionDataSourceId },
    properties,
    children,
  };

  const response = await fetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    await logger.error('Notion API error', { data: { error, status: response.status } });
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  const result = await response.json();

  return result;
}

/**
 * Check if multiple URLs already exist in Notion
 * Returns a Set of URLs that already exist
 */
export async function batchCheckDuplicates(urls: string[]): Promise<Set<string>> {
  const config = await getConfig();
  const existingUrls = new Set<string>();

  // 1. Deduplicate input URLs
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

  if (!config.notionToken || !config.notionDataSourceId || uniqueUrls.length === 0) {
    return existingUrls;
  }

  // 2. Hash URLs and map hash back to original URL
  const hashToUrl = new Map<string, string>();
  for (const url of uniqueUrls) {
    const hash = await hashUrl(url);
    hashToUrl.set(hash, url);
  }
  const hashes = Array.from(hashToUrl.keys());

  console.log(`[Synapse] Batch checking ${hashes.length} URLs (via hashes) for duplicates...`);

  // 3. First check local cache
  await hashCache.init();
  const cachedHashes = await hashCache.checkHashes(hashes);
  for (const hash of cachedHashes) {
    const originalUrl = hashToUrl.get(hash)!;
    existingUrls.add(originalUrl);
    console.log(`[Synapse] Found existing URL via local cache: ${originalUrl.substring(0, 50)}...`);
  }

  // Filter out hashes already found in cache
  const hashesToCheckInNotion = hashes.filter(h => !cachedHashes.has(h));

  if (hashesToCheckInNotion.length === 0) {
    console.log(`[Synapse] All hashes found in cache. Skipping Notion API check.`);
    return existingUrls;
  }

  console.log(`[Synapse] ${hashesToCheckInNotion.length} hashes missed cache. Querying Notion API...`);

  // Notion filter has a limit of 100 conditions
  const BATCH_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < hashesToCheckInNotion.length; i += BATCH_SIZE) {
    chunks.push(hashesToCheckInNotion.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const filter =
      chunk.length === 1
        ? {
          property: 'HashID',
          rich_text: { equals: chunk[0] },
        }
        : {
          or: chunk.map((hash) => ({
            property: 'HashID',
            rich_text: { equals: hash },
          })),
        };

    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await fetch(
          `${NOTION_API_BASE}/data_sources/${config.notionDataSourceId}/query?filter_properties[]=HashID`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.notionToken}`,
              'Content-Type': 'application/json',
              'Notion-Version': NOTION_API_VERSION,
            },
            body: JSON.stringify({
              filter,
              page_size: 100,
              start_cursor: cursor,
            }),
          },
        );

        if (response.ok) {
          const result = await response.json();
          console.log(
            `[Synapse] Notion query returned ${result.results.length} records for hash chunk`,
          );

          result.results.forEach((page: any) => {
            // Extract hash from HashID property
            const hash = page.properties?.HashID?.rich_text?.[0]?.plain_text;
            if (hash && hashToUrl.has(hash)) {
              // Add to existingUrls
              const originalUrl = hashToUrl.get(hash)!;
              existingUrls.add(originalUrl);
              console.log(
                `[Synapse] Found existing URL via Notion query: ${originalUrl.substring(0, 50)}...`,
              );
              // Also add back to our local cache for future lookups
              hashCache.addHash(hash).catch(e => console.error('[Synapse] Failed to add hash to cache:', e));
            }
          });

          hasMore = result.has_more;
          cursor = result.next_cursor || undefined;
        } else {
          const error = await response.json();
          console.error('[Synapse] Notion batch check API error:', error);
          hasMore = false;
        }
      } catch (e) {
        console.error('[Synapse] Batch duplicate check network/parsing error:', e);
        await logger.error('Batch duplicate check failed', { data: { error: e } });
        hasMore = false;
      }
    }
  }

  return existingUrls;
}

/**
 * Fetch all HashIDs from Notion to rebuild the local cache
 */
export async function fetchAllHashesFromNotion(): Promise<string[]> {
  const config = await getConfig();
  if (!config.notionToken || !config.notionDataSourceId) {
    throw new Error('Notion configuration incomplete');
  }

  console.log(`[Synapse] Fetching all HashIDs from Notion to rebuild cache...`);

  const allHashes: string[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${NOTION_API_BASE}/data_sources/${config.notionDataSourceId}/query?filter_properties[]=HashID`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': NOTION_API_VERSION,
        },
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
        }),
      },
    );

    if (response.ok) {
      const result = await response.json();

      result.results.forEach((page: any) => {
        const hash = page.properties?.HashID?.rich_text?.[0]?.plain_text;
        if (hash) {
          allHashes.push(hash);
        }
      });

      hasMore = result.has_more;
      cursor = result.next_cursor || undefined;
    } else {
      const error = await response.json();
      throw new Error(`Notion API error: ${error.message || response.statusText}`);
    }
  }

  console.log(`[Synapse] Fetched ${allHashes.length} hashes from Notion database.`);
  return allHashes;
}
