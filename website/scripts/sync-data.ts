import { getAllThoughts, getAllPublishedIds } from '../src/lib/notion';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../src/data');
const THOUGHTS_FILE = path.join(DATA_DIR, 'thoughts.json');
const THOUGHTS_BY_YEAR_DIR = path.join(DATA_DIR, 'thoughts-by-year');
const THOUGHTS_INDEX_FILE = path.join(THOUGHTS_BY_YEAR_DIR, 'index.json');
const PUBLIC_DATA_DIR = path.join(__dirname, '../public/data');
const PUBLIC_THOUGHTS_BY_YEAR_DIR = path.join(PUBLIC_DATA_DIR, 'thoughts-by-year');
const PUBLIC_THOUGHTS_INDEX_FILE = path.join(PUBLIC_THOUGHTS_BY_YEAR_DIR, 'index.json');
const METADATA_FILE = path.join(DATA_DIR, 'sync-metadata.json');
const DAILY_COUNTS_FILE = path.join(DATA_DIR, 'daily-counts.json');

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readJsonArray(filePath: string): any[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function sortByDateDesc(thoughts: any[]) {
    return thoughts.sort((a, b) => b.originalDate.localeCompare(a.originalDate));
}

function loadThoughtsFromByYearFiles(): any[] {
    if (!fs.existsSync(THOUGHTS_INDEX_FILE)) {
        return [];
    }

    const index = readJsonArray(THOUGHTS_INDEX_FILE);
    if (index.length === 0) {
        return [];
    }

    const thoughts = index.flatMap((entry: any) => {
        const fileName = entry.file || `${entry.year}.json`;
        const filePath = path.join(THOUGHTS_BY_YEAR_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`   Missing year file: ${filePath}`);
            return [];
        }
        return readJsonArray(filePath);
    });

    return sortByDateDesc(thoughts);
}

function loadExistingThoughts(): any[] {
    const thoughtsFromYearFiles = loadThoughtsFromByYearFiles();
    if (thoughtsFromYearFiles.length > 0) {
        return thoughtsFromYearFiles;
    }

    if (fs.existsSync(THOUGHTS_FILE)) {
        const thoughtsFromLegacy = readJsonArray(THOUGHTS_FILE);
        if (thoughtsFromLegacy.length > 0) {
            console.log('   Loaded existing thoughts from legacy thoughts.json.');
            return sortByDateDesc(thoughtsFromLegacy);
        }
    }

    return [];
}

function getThoughtYear(thought: any): string {
    const dateStr = String(thought.originalDate || '');
    const yearFromDatePrefix = dateStr.slice(0, 4);
    if (/^\d{4}$/.test(yearFromDatePrefix)) {
        return yearFromDatePrefix;
    }

    const parsedDate = new Date(dateStr);
    if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.getUTCFullYear().toString();
    }

    return 'unknown';
}

function sortYearsDesc(yearA: string, yearB: string): number {
    const isYearAValid = /^\d{4}$/.test(yearA);
    const isYearBValid = /^\d{4}$/.test(yearB);

    if (isYearAValid && isYearBValid) {
        return Number(yearB) - Number(yearA);
    }
    if (isYearAValid) return -1;
    if (isYearBValid) return 1;
    return yearB.localeCompare(yearA);
}

function clearJsonFilesInDir(dir: string) {
    if (!fs.existsSync(dir)) {
        return;
    }

    fs.readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .forEach((file) => fs.unlinkSync(path.join(dir, file)));
}

function writeThoughtsByYear(allThoughts: any[]) {
    const groupedByYear = new Map<string, any[]>();

    for (const thought of allThoughts) {
        const year = getThoughtYear(thought);
        const bucket = groupedByYear.get(year) || [];
        bucket.push(thought);
        groupedByYear.set(year, bucket);
    }

    const index = Array.from(groupedByYear.entries())
        .sort(([yearA], [yearB]) => sortYearsDesc(yearA, yearB))
        .map(([year, thoughts]) => ({
            year,
            file: `${year}.json`,
            count: thoughts.length,
        }));

    const targetDirs = [THOUGHTS_BY_YEAR_DIR, PUBLIC_THOUGHTS_BY_YEAR_DIR];
    targetDirs.forEach((dir) => {
        ensureDir(dir);
        clearJsonFilesInDir(dir);
    });

    for (const entry of index) {
        const payload = JSON.stringify(groupedByYear.get(entry.year) || [], null, 2);
        targetDirs.forEach((dir) => {
            fs.writeFileSync(path.join(dir, entry.file), payload);
        });
    }

    const indexPayload = JSON.stringify(index, null, 2);
    fs.writeFileSync(THOUGHTS_INDEX_FILE, indexPayload);
    fs.writeFileSync(PUBLIC_THOUGHTS_INDEX_FILE, indexPayload);

    return index;
}

function hasCompleteByYearFiles(): boolean {
    if (!fs.existsSync(THOUGHTS_INDEX_FILE) || !fs.existsSync(PUBLIC_THOUGHTS_INDEX_FILE)) {
        return false;
    }

    const index = readJsonArray(THOUGHTS_INDEX_FILE);
    if (index.length === 0) {
        return false;
    }

    return index.every((entry: any) => {
        const fileName = entry.file || `${entry.year}.json`;
        const srcFile = path.join(THOUGHTS_BY_YEAR_DIR, fileName);
        const publicFile = path.join(PUBLIC_THOUGHTS_BY_YEAR_DIR, fileName);
        return fs.existsSync(srcFile) && fs.existsSync(publicFile);
    });
}

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

    ensureDir(DATA_DIR);
    ensureDir(PUBLIC_DATA_DIR);

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

        // 3. Load existing thoughts from local source of truth
        let allThoughts = loadExistingThoughts();

        // 4. Merge and deduplicate by ID and HashID
        // Use hashId (URL hash) as the primary key for deduplication to handle concurrent saves
        const thoughtMap = new Map<string, any>();
        const processThought = (t: any) => {
            const hashId = t.hashId || '';
            const id = t.id;
            
            if (hashId) {
                // If we already have this hashId, keep the existing one (or we could compare dates)
                if (!thoughtMap.has(hashId)) {
                    thoughtMap.set(hashId, t);
                } else {
                    console.log(`   Found duplicate hashId: ${hashId.substring(0, 16)}... (ID: ${id}), skipping.`);
                }
            } else {
                // Fallback to ID if hashId is missing
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

        // 5. Check for deletions (Validate against current source of truth)
        console.log('   Checking for deleted/unpublished items...');
        const publishedIds = await getAllPublishedIds();
        const initialCount = allThoughts.length;
        allThoughts = allThoughts.filter(t => publishedIds.has(t.id));
        const deletedCount = initialCount - allThoughts.length;
        
        if (deletedCount > 0) {
             console.log(`   🗑️  Removed ${deletedCount} items that are no longer published.`);
        }

        // 6. Rebuild daily counts from the combined full dataset
        console.log('   Rebuilding daily counts from full dataset...');
        const dailyCounts = rebuildDailyCounts(allThoughts);

        const hasByYearFiles = hasCompleteByYearFiles();
        const needsDataRewrite = newThoughts.length > 0 || deletedCount > 0 || !hasByYearFiles;

        if (!needsDataRewrite) {
            console.log(`✅ No changes (no new thoughts, no deletions). Skipping file updates.`);
            return;
        }

        // 7. Write thoughts grouped by year (for both build-time and runtime fetch)
        const yearIndex = writeThoughtsByYear(allThoughts);

        // Remove legacy single-file storage after successful migration.
        if (fs.existsSync(THOUGHTS_FILE)) {
            fs.unlinkSync(THOUGHTS_FILE);
        }

        // 8. Update metadata
        fs.writeFileSync(
            METADATA_FILE,
            JSON.stringify({
                lastSyncTime: currentSyncStartTime,
                updatedAt: new Date().toISOString(),
                newItemsCount: newThoughts.length,
                totalItemsCount: allThoughts.length,
                yearFilesCount: yearIndex.length
            }, null, 2)
        );

        console.log(`✅ Sync complete!`);
        console.log(`📝 Total Thoughts: ${allThoughts.length} (+${newThoughts.length} new)`);
        console.log(`📂 Year Files: ${yearIndex.length}`);
        console.log(`📊 Daily Counts: ${dailyCounts.filter(d => d.count > 0).length} active days`);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

sync();
