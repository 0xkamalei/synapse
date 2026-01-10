# Website Scripts

Scripts for managing and maintaining the Synapse website data.

## Available Scripts

### Sync Data (`sync`)
Synchronizes thoughts data from Notion database to local JSON files.

```bash
bun run sync
```

**What it does:**
- Fetches all published thoughts from Notion database
- Deduplicates by title (using URL hash as unique identifier)
- Updates `src/data/thoughts.json` with combined dataset
- Rebuilds `src/data/daily-counts.json` from full dataset
- Updates sync metadata with timestamp and counts

**Features:**
- Incremental sync: Only fetches thoughts modified since last sync
- Automatic deduplication by title
- Maintains local cache to avoid unnecessary overwrites

---

### Clean Duplicates (`clean`, `clean:dry`)

Scans Notion database for duplicate entries with identical titles and removes them by archiving.

**Dry run mode (preview changes):**
```bash
bun run clean:dry
```

This will:
- Fetch all published thoughts from Notion
- Scan for duplicate titles
- Show which records would be archived
- Make no actual changes

**Actual run (apply changes):**
```bash
bun run clean
```

This will:
- Perform the same scan as dry-run
- Archive duplicate entries (set Status to "Archive")
- Save a log of removed duplicates to `scripts/clean-log.json`

**How duplicates are handled:**
- Groups thoughts by their title (hash)
- For each group with multiple entries, keeps the most recent one (by `originalDate`)
- Archives all older copies
- Logs which entries were removed

**Example output:**

```
🧹 Starting duplicate cleaning process...

🔍 DRY RUN MODE: No changes will be made

📥 Fetching all published thoughts from Notion...
   Found 236 published thoughts

🔍 Scanning for duplicate titles...

📋 Duplicate found: "83f59dd378acf35d883eaf79f0f77beb5ad72795f820bad246b8ab4c3566c082"
   Total copies: 2
   [0] 2026-01-10T04:05:00.000+00:00 - Weibo - ID: 2e46dd2f-2d12-8139-af55-e160581e08a7
   [1] 2026-01-08T03:59:00.000+00:00 - Weibo - ID: 2e46dd2f-2d12-8132-a13d-f8e876c42b0e

Records that would be archived:
   - ID: 2e46dd2f-2d12-8132-a13d-f8e876c42b0e (Weibo) - 2026-01-08T03:59:00.000+00:00
     Title: "83f59dd378acf35d883eaf79f0f77beb5ad72795f820bad246b8ab4c3566c082"
     Content: claude code 为什么会生成这么多文档？ ...

✅ Dry run complete. Run without --dry-run to apply changes.
```

---

## Environment Variables

Both scripts require the following environment variables to be set:

```bash
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NOTION_DATASOURCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Technical Details

### Data Structure

**Title field:**
The `title` field in Notion is actually a URL hash (SHA256) that serves as a unique identifier for content. This prevents duplicates when the same content is collected multiple times from different sources.

Format: `SHA256(originalUrl)`

### API Implementation

Both scripts use the Notion API client with:
- Custom data source queries for better performance
- Pagination support (up to 100 items per page)
- Proper status filtering (only processes "Published" entries)

### Deduplication Logic

**In sync-data.ts:**
- Primary key: title (URL hash)
- Strategy: Keep existing entry, skip newer duplicates
- Benefits: Avoids overwriting local metadata

**In clean-duplicates.ts:**
- Primary key: title (URL hash)
- Strategy: Keep most recent, archive older copies
- Benefits: Cleans up Notion database of accidental duplicates

---

## Troubleshooting

### No changes detected on run
If `sync` reports "No new thoughts found", this is normal when:
- No new content has been added to Notion since last sync
- The sync data is already up to date

### Dry run shows no duplicates
If `clean:dry` finds no duplicates, your database is clean and no action is needed.

### API Errors
Make sure your environment variables are correctly set and the tokens have proper permissions to:
- Query the Notion database
- Update page properties (for clean operation)
