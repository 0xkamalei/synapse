import { getAllThoughts, getDailyCounts } from '../src/lib/notion';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../src/data');

async function sync() {
    console.log('🚀 Starting Notion data sync...');

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    try {
        const thoughts = await getAllThoughts();

        // Calculate daily counts locally across the full range of data
        const counts = new Map<string, number>();

        if (thoughts.length > 0) {
            // Find the earliest date
            const dates = thoughts.map(t => new Date(t.originalDate.split('T')[0]));
            const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
            const today = new Date();

            // Fill the map from minDate to today
            let current = new Date(minDate);
            while (current <= today) {
                const dateStr = current.toISOString().split('T')[0];
                counts.set(dateStr, 0);
                current.setDate(current.getDate() + 1);
            }

            // Count thoughts per day
            for (const thought of thoughts) {
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
            path.join(DATA_DIR, 'thoughts.json'),
            JSON.stringify(thoughts, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'daily-counts.json'),
            JSON.stringify(dailyCounts, null, 2)
        );

        console.log(`✅ Sync complete!`);
        console.log(`📝 Thoughts: ${thoughts.length}`);
        console.log(`📊 Daily Counts: ${dailyCounts.filter(d => d.count > 0).length} active days`);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

sync();
