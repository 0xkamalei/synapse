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
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Create rich text array for Notion
 * @param {string} content
 * @returns {Array}
 */
function createRichText(content) {
    if (!content) return [];

    // Notion has a 2000 character limit per rich text block
    const MAX_LENGTH = 2000;
    const chunks = [];

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
 * @param {Object} content - Content object
 * @param {string} content.title - Title/summary (first 50 chars of text)
 * @param {string} content.text - Full content text
 * @param {string} content.source - Source platform (X, Bilibili, Manual)
 * @param {string} content.url - Original URL
 * @param {string} content.timestamp - Original publish time (ISO format)
 * @param {string[]} content.images - Array of image CDN URLs
 * @param {string[]} content.tags - Optional tags
 * @returns {Promise<Object>} - Created page object
 */
async function saveToNotion(content) {
    const config = await getConfig();

    if (!config.notionToken || !config.notionDatabaseId) {
        throw new Error('Notion configuration incomplete');
    }

    await logger.info('Saving to Notion', {
        source: content.source,
        url: content.url,
        hasImages: content.images?.length > 0,
        hasVideos: content.videos?.length > 0
    });

    console.log('[Synapse] Notion Save Payload Data:', {
        text: content.text?.substring(0, 30) + '...',
        images: content.images,
        videos: content.videos
    });

    // Build page properties
    const properties = {
        Title: {
            title: [{
                text: {
                    content: (content.source === 'Bilibili' && content.type === 'text') ? "" : truncateText(content.text, 50)
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

    // Add tags if provided
    if (content.tags && content.tags.length > 0) {
        properties.Tags = {
            multi_select: content.tags.map(tag => ({ name: tag }))
        };
    }

    // Build page children (content blocks)
    const children = [];

    // Add main text as paragraph
    if (content.text) {
        children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: createRichText(content.text)
            }
        });
    }

    // Add images as image blocks
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

    // Add videos as video blocks
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

    // Create page in Notion
    const payload = {
        parent: { database_id: config.notionDatabaseId },
        properties,
        children
    };

    console.log('[Synapse] Notion API Request Body:', JSON.stringify(payload, null, 2));

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
        await logger.error('Notion API error', { error, status: response.status });
        throw new Error(`Notion API error: ${error.message || response.statusText}`);
    }

    const result = await response.json();

    await logger.success('Saved to Notion', {
        pageId: result.id,
        url: result.url
    });

    return result;
}

/**
 * Check if content already exists in Notion (by URL)
 * @param {string} url - Original URL to check
 * @returns {Promise<boolean>}
 */
async function checkDuplicate(url) {
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
    const isDup = result.results.length > 0;
    if (isDup) {
        console.log('[Synapse] Found existing record in Notion:', result.results[0].url);
    }
    return isDup;
}

export { saveToNotion, checkDuplicate, truncateText };
