# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Synapse is a personal thought aggregation platform that collects content from multiple sources (X.com, Bilibili, QZone) via a Chrome extension, stores them in Notion, and displays them on a static website built with Astro.

### Architecture

The project has three main components:

1. **Chrome Extension** (`/chrome-extension`) - Content collectors for X.com, Bilibili, and QZone
2. **Website** (`/website`) - Astro-based static site displaying aggregated content from Notion
3. **Scripts** (`/scripts`) - Node.js utilities for database initialization

### Data Flow

Content flows through the system as:
- User triggers collection via Chrome extension on X/Bilibili/QZone pages
- Extension parses page DOM to extract content, metadata, and images
- Images are uploaded to a GitHub repository (via GitHub API + jsDelivr CDN)
- Content is saved to Notion database with structured properties
- Website periodically syncs data from Notion and generates static pages
- Static site is deployed to hosting platform

## Chrome Extension Development

### Build and Test

```bash
# Compile TypeScript to JavaScript
cd chrome-extension
npm run build

# Watch mode for continuous compilation
npm run watch

# Run tests (requires build first)
npm run test
```

### Project Structure

```
chrome-extension/
├── manifest.json              # Manifest V3 configuration
├── dist/                      # Compiled JavaScript output
├── content/                   # Content scripts for different platforms
│   ├── x-collector.ts        # Extracts tweets from X.com
│   ├── bilibili-collector.ts # Extracts dynamics from Bilibili
│   ├── qzone-collector.ts    # Extracts feeds from QZone
│   └── collector.test.ts     # Integration tests
├── background/
│   └── service-worker.ts     # Background service worker
├── popup/
│   └── popup.ts              # Extension popup UI logic
├── options/
│   └── options.ts            # Settings page
├── logs/
│   └── logs.ts               # Logs viewer page
└── lib/                      # Shared utilities
    ├── types.d.ts            # TypeScript type definitions
    ├── storage.ts            # Chrome storage API wrapper
    ├── logger.ts             # Logging utility
    ├── github-uploader.ts    # GitHub image upload
    └── notion-client.ts      # Notion API wrapper
```

### Testing Collectors

The collectors are tested using target HTML files in `chrome-extension/target-html/`. Tests:
1. Load compiled collector code into a simulated DOM environment (using happy-dom)
2. Run collector functions against test HTML
3. Generate or validate JSON output in `target-html/*.json`

To test after modifications:
```bash
npm run build && npm run test
```

### Key Collector Patterns

Each collector follows a standard pattern for communication:

**Unified PageInfo Interface**
- All collectors implement `GET_PAGE_INFO` message handler
- Returns standardized `PageInfo` object defined in `lib/types.d.ts` (global type):
  ```typescript
  interface PageInfo {
    isTargetPage: boolean;      // Whether current page matches configured target
    itemCount: number;           // Number of content items found
    currentUrl: string;          // Current page URL
    pageIdentifier?: string;     // Platform-specific ID (user ID, group ID, etc.)
    [key: string]: any;          // Additional platform-specific data
  }
  ```
- PageInfo is a global type like CollectedContent - no import needed in collectors
- No special cases needed in popup.ts - all collectors use `isTargetPage` flag

**Popup Communication Architecture**
- popup.ts sends `GET_PAGE_INFO` message to all frames in current tab
- Each collector responds with standardized PageInfo
- Popup shows "Collect Now" button if any collector reports `isTargetPage: true`
- This design eliminates the need to modify popup.ts when adding new platforms

Each collector exposes two main functions:
- `findAll*()` - Parses DOM and returns element references
- `collect*Data()` - Extracts data from individual elements

For example, X collector has:
- `findAllTweetsX()` - Returns tweet DOM elements
- `collectTweetDataX(element)` - Returns structured tweet data

### Adding a New Content Source

1. Create new TypeScript file in `content/` (e.g., `new-platform-collector.ts`)
2. Implement PageInfo return (no import needed - it's a global type):
   ```typescript
   // PageInfo is defined in lib/types.d.ts as a global type
   async function getPageInfo(): Promise<PageInfo> {
     return {
       isTargetPage: true/false,  // REQUIRED: matches target config
       itemCount: 0,               // REQUIRED: number of items found
       currentUrl: window.location.href,  // REQUIRED
       pageIdentifier: 'user123',  // OPTIONAL: platform-specific ID
       // Add any platform-specific data here
     };
   }
   ```
3. Implement the following:
   - `findAll*()` - Find content elements in DOM
   - `collect*Data()` - Extract data from elements
   - Message listener for `GET_PAGE_INFO`, `COLLECT_CURRENT`, and `POP_TO_CONTENT_COLLECT`
4. Add content script entry to `manifest.json`
5. Add platform config to `lib/platforms.ts`
6. Add UI elements to `options.html` and `options.ts`
7. Add storage types to `lib/types.d.ts`
8. Create test HTML file in `target-html/`
9. Add test case to `collector.test.ts`
10. Build and test with `npm run test`

**Important**: The popup will automatically detect the new collector through `GET_PAGE_INFO` messaging - no need to modify `popup.ts`!

## Website Development

### Build and Serve

```bash
cd website

# Install dependencies
bun install

# Development server (hot reload at http://localhost:4321)
bun run dev

# Build static site
bun run build

# Preview production build
bun run preview

# Sync data from Notion (generates src/data/thoughts.json)
bun run sync
```

### Project Structure

```
website/
├── astro.config.mjs          # Astro configuration
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── components/
│   │   ├── Heatmap.astro     # GitHub-style contribution graph
│   │   ├── Calendar.astro    # Calendar view of thoughts
│   │   └── ThoughtCard.astro # Individual thought display
│   ├── layouts/
│   │   └── BaseLayout.astro  # Base template
│   ├── pages/
│   │   ├── index.astro       # Homepage with heatmap
│   │   └── calendar.astro    # Calendar view page
│   ├── styles/
│   │   └── global.css        # Material Design 3 styles + CSS variables
│   ├── lib/
│   │   └── notion.ts         # Notion API client and data fetching
│   ├── data/
│   │   └── thoughts.json     # Generated by sync script (git ignored)
│   └── env.d.ts
└── dist/                     # Built static site output
```

### Environment Setup

Create `.env` in `/website` directory:
```
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NOTION_DATASOURCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

The `NOTION_DATASOURCE_ID` is required for efficient data querying (uses Notion's datasource API instead of standard database API).

### Notion Data Sync

The website syncs data from Notion via two paths:

1. **Local development**: Run `bun run sync` to generate `src/data/thoughts.json`
2. **GitHub Actions**: Scheduled daily (via `.github/workflows/sync-data.yml`) or manually triggered
   - Runs `bun run sync`
   - Commits generated data to repo if changed
   - Uses GitHub secrets for credentials

The sync script in `scripts/sync-data.ts`:
- Queries Notion database for "Published" items
- Fetches all blocks (content, images, videos) for each page
- Parses into `Thought` objects with structured data
- Supports incremental sync with optional `since` parameter

### Customization

**Colors**: Edit CSS custom properties in `src/styles/global.css` (Material Design 3 tokens)

**Site Title**: Update in `src/layouts/BaseLayout.astro`

**Notion Fields**: The parser in `src/lib/notion.ts` expects these database fields:
- `Title` (Title)
- `Content` (Rich Text)
- `Source` (Select: X/Bilibili/Manual)
- `OriginalURL` (URL)
- `OriginalDate` (Date)
- `Tags` (Multi-select)
- `Status` (Select: Published/Draft/Archived)
- `CollectedAt` (optional, for incremental sync)

## Scripts

### Initialize Notion Database

```bash
cd scripts
npm install
NOTION_TOKEN=secret_... NOTION_WORKSPACE_ID=... npm run init-db
```

Creates a new Notion database with all required properties.

## GitHub Workflows

### Daily Data Sync (`sync-data.yml`)

- Runs daily at UTC 0:00 (8:00 AM Beijing time)
- Can be manually triggered via `workflow_dispatch`
- Syncs Notion data to `website/src/data/` and commits changes
- Requires secrets: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_DATASOURCE_ID`

## Key Technologies

| Component | Stack |
|-----------|-------|
| Chrome Extension | Manifest V3, TypeScript, Vanilla DOM APIs |
| Website | Astro 4, TypeScript, Material Design 3 |
| Data Storage | Notion API, GitHub API |
| Image Hosting | GitHub repository + jsDelivr CDN |
| Runtime | Bun (website/scripts), Node.js (extension) |

## Development Tips

### Chrome Extension

- Use `console.log()` in content scripts and background worker—view logs via:
  - Content script: Inspect page (F12)
  - Service worker: Chrome DevTools → Extensions → click "service worker"
- The extension checks for duplicate content by `OriginalURL` to prevent re-collection
- Test HTML files in `target-html/` should be representative of actual page structure

### Website

- Astro pages are SSG—no client-side runtime unless explicitly using `client:*` directives
- Environment variables in `.env` are accessible via `import.meta.env` (build-time) or `process.env` (runtime)
- Notion API queries use the datasource API (`data_sources/{datasourceId}/query`) for efficient filtering/sorting
- Images embedded in Notion blocks are extracted separately from page properties

### Common Tasks

**Running specific test in extension:**
```bash
# Only run X.com collector test
bun test content/collector.test.ts -t "X.com Collector"
```

**Debugging Notion data:** Print the raw response in `src/lib/notion.ts:getAllThoughts()` to inspect Notion's API response structure.

**Checking website build size:**
```bash
cd website && bun run build && du -sh dist/
```

## Debugging

**Extension not showing button**: Check manifest.json `host_permissions` includes the target domain. Reload extension after manifest changes.

**Images not uploading**: Verify GitHub token has `repo` scope and the repository is public.

**Notion sync slow**: Check `NOTION_DATASOURCE_ID` is set correctly. Standard database queries are slower than datasource queries.

**Website not updating after sync**: Clear `.astro` cache and rebuild: `rm -rf website/.astro && bun run build`
