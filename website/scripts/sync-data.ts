import { getAllThoughts } from '../src/lib/notion';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../src/data');
const THOUGHTS_FILE = path.join(DATA_DIR, 'thoughts.json');
const METADATA_FILE = path.join(DATA_DIR, 'sync-metadata.json');
const DAILY_COUNTS_FILE = path.join(DATA_DIR, 'daily-counts.json');

/**
 * Rebuilds the daily-counts.json file from the provided thoughts array.
 * This ensures the counts are always fresh and calculated from the source of truth.
 */
function rebuildDailyCounts(allThoughts: any[]) {
    const counts = new Map<string, number>();

    if (allThoughts.length > 0) {
        // Find the earliest date
        const dates = allThoughts.map(t => new Date(t.originalDate.split('T')[0]));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const today = new Date();

        // Fill the map from minDate to today with 0s to ensure no gaps in heatmap
        let current = new Date(minDate);
        while (current <= today) {
            const dateStr = current.toISOString().split('T')[0];
            counts.set(dateStr, 0);
            current.setDate(current.getDate() + 1);
        }

        // Count thoughts per day from the full dataset
        for (const thought of allThoughts) {
            const date = thought.originalDate.split('T')[0];
            if (counts.has(date)) {
                counts.set(date, (counts.get(date) || 0) + 1);
            }
        }
    }

    const dailyCounts = Array.from(counts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

    fs.writeFileSync(
        DAILY_COUNTS_FILE,
        JSON.stringify(dailyCounts, null, 2)
    );

    return dailyCounts;
}

async function sync() {
    console.log('🚀 Starting incremental Notion data sync...');

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    try {
        // 1. Get last sync time from metadata
        let lastSyncTime: string | undefined;
        if (fs.existsSync(METADATA_FILE)) {
            const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
            lastSyncTime = metadata.lastSyncTime;
            console.log(`   Last sync time: ${lastSyncTime}`);
        } else {
            console.log('   No metadata found, performing full sync...');
        }

        // Record start time for this sync
        const currentSyncStartTime = new Date().toISOString();

        // 2. Fetch new thoughts since last sync
        const newThoughts = await getAllThoughts(lastSyncTime);
        console.log(`   Fetched ${newThoughts.length} new thoughts.`);

        // Optimization: If no new thoughts and thoughts file exists, skip writing
        if (newThoughts.length === 0 && fs.existsSync(THOUGHTS_FILE)) {
            console.log(`✅ No new thoughts found. Skipping file updates to avoid unnecessary commits.`);
            return;
        }

        // 3. Load existing thoughts from the local source of truth
        let allThoughts: any[] = [];
        if (fs.existsSync(THOUGHTS_FILE)) {
            try {
                allThoughts = JSON.parse(fs.readFileSync(THOUGHTS_FILE, 'utf-8'));
            } catch (e) {
                console.warn('   Could not parse existing thoughts.json, starting fresh.');
                allThoughts = [];
            }
        }

        // 4. Merge and deduplicate by ID and Title
        // Use title (URL hash) as the primary key for deduplication to handle concurrent saves
        const thoughtMap = new Map<string, any>();
        const idToTitleMap = new Map<string, string>();

        const processThought = (t: any) => {
            const title = t.title || '';
            const id = t.id;
            
            if (title) {
                // If we already have this title, keep the existing one (or we could compare dates)
                if (!thoughtMap.has(title)) {
                    thoughtMap.set(title, t);
                    idToTitleMap.set(id, title);
                } else {
                    console.log(`   Found duplicate title: ${title} (ID: ${id}), skipping.`);
                }
            } else {
                // Fallback to ID if title is missing
                thoughtMap.set(id, t);
            }
        };

        // Add existing thoughts first
        allThoughts.forEach(processThought);
        // Add new thoughts from Notion
        newThoughts.forEach(processThought);
        
        // Convert back to array and sort by date descending
        allThoughts = Array.from(thoughtMap.values())
            .sort((a, b) => b.originalDate.localeCompare(a.originalDate));

        // 5. Rebuild daily counts from the combined full dataset
        console.log('   Rebuilding daily counts from full dataset...');
        const dailyCounts = rebuildDailyCounts(allThoughts);

        // 6. Write updated thoughts data
        fs.writeFileSync(
            THOUGHTS_FILE,
            JSON.stringify(allThoughts, null, 2)
        );

        // 7. Update metadata
        fs.writeFileSync(
            METADATA_FILE,
            JSON.stringify({
                lastSyncTime: currentSyncStartTime,
                updatedAt: new Date().toISOString(),
                newItemsCount: newThoughts.length,
                totalItemsCount: allThoughts.length
            }, null, 2)
        );

        console.log(`✅ Sync complete!`);
        console.log(`📝 Total Thoughts: ${allThoughts.length} (+${newThoughts.length} new)`);
        console.log(`📊 Daily Counts: ${dailyCounts.filter(d => d.count > 0).length} active days`);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

sync();
