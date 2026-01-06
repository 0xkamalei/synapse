/**
 * Notion Client
 * Handles saving content to Notion database
 */

import { getConfig } from './storage.js';
import { logger } from './logger.js';

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
            text: { content: content.substring(i, i + MAX_LENGTH) }
        });
    }

    return chunks;
}

/**
 * Generate a stable hash for a URL
 */
async function hashUrl(url: string): Promise<string> {
    if (!url) return '';
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Save content to Notion database
 */
export async function saveToNotion(content: CollectedContent): Promise<any> {
    const config = await getConfig();

    if (!config.notionToken || !config.notionDatabaseId || !config.notionDataSourceId) {
        throw new Error('Notion configuration incomplete');
    }

    const urlHash = await hashUrl(content.url);

    // Build page properties
    const properties: any = {
        Title: {
            title: [{
                text: {
                    content: urlHash || truncateText(content.text, 10)
                }
            }]
        },
        Content: {
            rich_text: createRichText(content.text)
        },
        Type: {
            select: { name: content.type || 'text' }
        },
        Source: {
            select: { name: content.source }
        },
        OriginalURL: {
            url: content.url
        },
        OriginalDate: {
            date: { start: content.timestamp || new Date().toISOString() }
        },
        Status: {
            select: { name: 'Published' }
        }
    };

    // Build page children (content blocks)
    const children: any[] = [];

    if (content.text) {
        children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: createRichText(content.text)
            }
        });
    }

    if (content.images && content.images.length > 0) {
        for (const imageUrl of content.images) {
            children.push({
                object: 'block',
                type: 'image',
                image: {
                    type: 'external',
                    external: { url: imageUrl }
                }
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
                    external: { url: videoUrl }
                }
            });
        }
    }

    const payload = {
        parent: { database_id: config.notionDatabaseId },
        properties,
        children
    };

    const response = await fetch(`${NOTION_API_BASE}/pages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_API_VERSION
        },
        body: JSON.stringify(payload)
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

    if (!config.notionToken || !config.notionDatabaseId || !config.notionDataSourceId || uniqueUrls.length === 0) {
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

    // Notion filter has a limit of 100 conditions
    const BATCH_SIZE = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
        chunks.push(hashes.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
        const filter = chunk.length === 1
            ? {
                property: 'Title',
                title: { equals: chunk[0] }
            }
            : {
                or: chunk.map(hash => ({
                    property: 'Title',
                    title: { equals: hash }
                }))
            };

        let cursor: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await fetch(`${NOTION_API_BASE}/data_sources/${config.notionDataSourceId}/query?filter_properties[]=Title`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.notionToken}`,
                        'Content-Type': 'application/json',
                        'Notion-Version': NOTION_API_VERSION
                    },
                    body: JSON.stringify({
                        filter,
                        page_size: 100,
                        start_cursor: cursor
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`[Synapse] Notion query returned ${result.results.length} records for hash chunk`);

                    result.results.forEach((page: any) => {
                        // Extract text from title property
                        const hash = page.properties?.Title?.title?.[0]?.plain_text;
                        if (hash && hashToUrl.has(hash)) {
                            const originalUrl = hashToUrl.get(hash)!;
                            existingUrls.add(originalUrl);
                            console.log(`[Synapse] Found existing URL via hash: ${originalUrl.substring(0, 50)}...`);
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

 