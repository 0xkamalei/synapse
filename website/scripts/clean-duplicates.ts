/**
 * Clean script to remove duplicate thoughts with identical titles from Notion database
 * Scans the Notion database for duplicate titles and keeps only the most recent one
 */

import { Client } from '@notionhq/client';
import fs from 'fs';

const notion = new Client({
    auth: process.env.NOTION_TOKEN,
    notionVersion: '2025-09-03'
});

const databaseId = process.env.NOTION_DATABASE_ID;
const datasourceId = process.env.NOTION_DATASOURCE_ID;

interface ThoughtRecord {
    id: string;
    title: string;
    originalDate: string;
    content: string;
    source: string;
}

/**
 * Fetch all published thoughts from Notion
 */
async function getAllPublishedThoughts(): Promise<ThoughtRecord[]> {
    const thoughts: ThoughtRecord[] = [];
    let cursor: string | undefined;

    const filter = {
        and: [
            {
                property: 'Status',
                select: { equals: 'Published' }
            }
        ]
    };

    const queryParams = [
        'Title',
        'Content',
        'Source',
        'OriginalDate',
        'Status'
    ].map(p => `filter_properties[]=${encodeURIComponent(p)}`).join('&');

    do {
        const response: any = await notion.request({
            path: `data_sources/${datasourceId}/query?${queryParams}`,
            method: 'post',
            body: {
                filter: filter,
                sorts: [
                    { property: 'OriginalDate', direction: 'descending' }
                ],
                start_cursor: cursor,
                page_size: 100
            }
        });

        for (const page of response.results) {
            const props = page.properties;
            thoughts.push({
                id: page.id,
                title: props.Title?.title?.[0]?.plain_text || '',
                originalDate: props.OriginalDate?.date?.start || page.created_time,
                content: props.Content?.rich_text?.map((t: any) => t.plain_text).join('') || '',
                source: props.Source?.select?.name || 'Manual'
            });
        }

        cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    return thoughts;
}

/**
 * Find duplicate titles and determine which ones to delete
 */
function findDuplicates(thoughts: ThoughtRecord[]): { duplicates: ThoughtRecord[]; toDelete: ThoughtRecord[] } {
    const titleMap = new Map<string, ThoughtRecord[]>();

    // Group by title
    for (const thought of thoughts) {
        if (thought.title) {
            if (!titleMap.has(thought.title)) {
                titleMap.set(thought.title, []);
            }
            titleMap.get(thought.title)!.push(thought);
        }
    }

    // Find duplicates (title appearing more than once)
    const duplicates: ThoughtRecord[] = [];
    const toDelete: ThoughtRecord[] = [];

    for (const [title, records] of titleMap.entries()) {
        if (records.length > 1) {
            // Keep the most recent one, delete the rest
            records.sort((a, b) => b.originalDate.localeCompare(a.originalDate));

            console.log(`\n📋 Duplicate found: "${title}"`);
            console.log(`   Total copies: ${records.length}`);

            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                console.log(`   [${i}] ${record.originalDate} - ${record.source} - ID: ${record.id}`);

                if (i > 0) {
                    duplicates.push(record);
                    toDelete.push(record);
                }
            }
        }
    }

    return { duplicates, toDelete };
}

/**
 * Archive page in Notion (set Status to "Archive")
 */
async function archivePage(pageId: string): Promise<boolean> {
    try {
        await notion.pages.update({
            page_id: pageId,
            properties: {
                Status: {
                    select: { name: 'Archive' }
                }
            }
        });
        return true;
    } catch (error) {
        console.error(`Failed to archive page ${pageId}:`, error);
        return false;
    }
}

/**
 * Main clean function
 */
async function clean() {
    const isDryRun = process.argv.includes('--dry-run');

    console.log('🧹 Starting duplicate cleaning process...\n');
    if (isDryRun) {
        console.log('🔍 DRY RUN MODE: No changes will be made\n');
    }

    try {
        // 1. Fetch all published thoughts
        console.log('📥 Fetching all published thoughts from Notion...');
        const thoughts = await getAllPublishedThoughts();
        console.log(`   Found ${thoughts.length} published thoughts\n`);

        // 2. Find duplicates
        console.log('🔍 Scanning for duplicate titles...');
        const { duplicates, toDelete } = findDuplicates(thoughts);

        if (duplicates.length === 0) {
            console.log('\n✅ No duplicates found! Database is clean.\n');
            return;
        }

        console.log(`\n⚠️  Found ${duplicates.length} duplicate entries to remove\n`);

        // 3. Dry run or actual run
        if (isDryRun) {
            console.log('Records that would be archived:');
            for (const record of toDelete) {
                console.log(`   - ID: ${record.id} (${record.source}) - ${record.originalDate}`);
                console.log(`     Title: "${record.title}"`);
                console.log(`     Content: ${record.content.substring(0, 60)}...`);
            }
            console.log('\n✅ Dry run complete. Run without --dry-run to apply changes.\n');
            return;
        }

        // 4. Archive duplicate entries
        console.log('🗑️  Archiving duplicate entries...\n');
        let successCount = 0;
        let failCount = 0;

        for (const record of toDelete) {
            const success = await archivePage(record.id);
            if (success) {
                console.log(`   ✅ Archived: ${record.id}`);
                successCount++;
            } else {
                console.log(`   ❌ Failed to archive: ${record.id}`);
                failCount++;
            }
        }

        console.log(`\n✅ Clean complete!`);
        console.log(`   Successfully archived: ${successCount}`);
        if (failCount > 0) {
            console.log(`   Failed to archive: ${failCount}`);
        }

        // 5. Save a log of what was cleaned
        const cleanLog = {
            timestamp: new Date().toISOString(),
            duplicatesFound: duplicates.length,
            archived: successCount,
            failed: failCount,
            removedIds: toDelete.map(r => ({
                id: r.id,
                title: r.title,
                source: r.source,
                originalDate: r.originalDate
            }))
        };

        const logPath = '/Users/lei/dev/personal/synapse/website/scripts/clean-log.json';
        fs.writeFileSync(logPath, JSON.stringify(cleanLog, null, 2));
        console.log(`\n📝 Clean log saved to: scripts/clean-log.json\n`);

    } catch (error) {
        console.error('❌ Clean failed:', error);
        process.exit(1);
    }
}

// Run the clean function
clean();
