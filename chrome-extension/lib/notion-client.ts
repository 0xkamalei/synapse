/**
 * Notion Client
 * Handles saving content to Notion database
 */

import { getConfig } from './storage.js';
import { logger } from './logger.js';

const NOTION_API_VERSION = '2022-06-28';
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
 * Save content to Notion database
 */
export async function saveToNotion(content: CollectedContent): Promise<any> {
    const config = await getConfig();

    if (!config.notionToken || !config.notionDatabaseId) {
        throw new Error('Notion configuration incomplete');
    }

    await logger.info('Saving to Notion', {
        data: {
            source: content.source,
            url: content.url,
            hasImages: content.images?.length > 0,
            hasVideos: content.videos?.length > 0
        }
    });

    // Build page properties
    const properties: any = {
        Title: {
            title: [{
                text: {
                    content: truncateText(content.text, 10)
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

    await logger.success('Saved to Notion', {
        data: {
            pageId: result.id,
            url: result.url
        }
    });

    return result;
}

/**
 * Check if content already exists in Notion (by URL)
 */
export async function checkDuplicate(url: string): Promise<boolean> {
    const config = await getConfig();

    if (!config.notionToken || !config.notionDatabaseId) {
        return false;
    }

    const response = await fetch(`${NOTION_API_BASE}/databases/${config.notionDatabaseId}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_API_VERSION
        },
        body: JSON.stringify({
            filter: {
                property: 'OriginalURL',
                url: { equals: url }
            },
            page_size: 1
        })
    });

    if (!response.ok) {
        return false;
    }

    const result = await response.json();
    return result.results.length > 0;
}
