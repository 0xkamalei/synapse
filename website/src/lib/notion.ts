/**
 * Notion API Client for fetching thoughts
 */

import { Client } from '@notionhq/client';

const notion = new Client({
    auth: import.meta.env.NOTION_TOKEN
});

const databaseId = import.meta.env.NOTION_DATABASE_ID;

export interface Thought {
    id: string;
    title: string;
    content: string;
    source: 'X' | 'Bilibili' | 'Manual';
    originalUrl: string;
    originalDate: string;
    images: string[];
    videos: string[];
    tags: string[];
    createdAt: string;
}

/**
 * Parse Notion page to Thought object
 */
function parseNotionPage(page: any, blocks: any[] = []): Thought {
    const props = page.properties;

    const images: string[] = [];
    const videos: string[] = [];

    // Extract media from blocks
    for (const block of blocks) {
        if (block.type === 'image') {
            const url = block.image.type === 'external' ? block.image.external.url : block.image.file.url;
            if (url) images.push(url);
        } else if (block.type === 'video') {
            const url = block.video.type === 'external' ? block.video.external.url : block.video.file.url;
            if (url) videos.push(url);
        }
    }

    return {
        id: page.id,
        title: props.Title?.title?.[0]?.plain_text || '',
        content: props.Content?.rich_text?.map((t: any) => t.plain_text).join('') || '',
        source: props.Source?.select?.name || 'Manual',
        originalUrl: props.OriginalURL?.url || '',
        originalDate: props.OriginalDate?.date?.start || page.created_time,
        images,
        videos,
        tags: props.Tags?.multi_select?.map((t: any) => t.name) || [],
        createdAt: page.created_time
    };
}

/**
 * Fetch all published thoughts from Notion
 */
export async function getAllThoughts(): Promise<Thought[]> {
    const thoughts: Thought[] = [];
    let cursor: string | undefined;

    do {
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: 'Status',
                select: { equals: 'Published' }
            },
            sorts: [
                { property: 'OriginalDate', direction: 'descending' }
            ],
            start_cursor: cursor,
            page_size: 100
        });

        // Fetch blocks for all pages in parallel
        const pagesWithBlocks = await Promise.all(response.results.map(async (page) => {
            const blocksResponse = await notion.blocks.children.list({
                block_id: page.id
            });
            return parseNotionPage(page, blocksResponse.results);
        }));

        thoughts.push(...pagesWithBlocks);

        cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    return thoughts;
}

/**
 * Get thoughts grouped by date for calendar view
 */
export async function getThoughtsByDate(): Promise<Map<string, Thought[]>> {
    const thoughts = await getAllThoughts();
    const grouped = new Map<string, Thought[]>();

    for (const thought of thoughts) {
        const date = thought.originalDate.split('T')[0]; // YYYY-MM-DD
        if (!grouped.has(date)) {
            grouped.set(date, []);
        }
        grouped.get(date)!.push(thought);
    }

    return grouped;
}

/**
 * Get daily counts for heatmap (last 365 days)
 */
export async function getDailyCounts(): Promise<{ date: string; count: number }[]> {
    const thoughts = await getAllThoughts();
    const counts = new Map<string, number>();

    // Initialize last 365 days with 0
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        counts.set(dateStr, 0);
    }

    // Count thoughts per day
    for (const thought of thoughts) {
        const date = thought.originalDate.split('T')[0];
        if (counts.has(date)) {
            counts.set(date, counts.get(date)! + 1);
        }
    }

    // Sort by date ascending
    return Array.from(counts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get a single thought by ID
 */
export async function getThoughtById(id: string): Promise<Thought | null> {
    try {
        const page = await notion.pages.retrieve({ page_id: id });
        const blocksResponse = await notion.blocks.children.list({
            block_id: id
        });
        return parseNotionPage(page, blocksResponse.results);
    } catch {
        return null;
    }
}
