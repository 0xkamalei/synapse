# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Synapse is a personal thought aggregation platform that collects content from multiple sources (X.com, Bilibili, QZone) via a Chrome extension, pushes it to a local Synapse server, stores it as Markdown with YAML front matter, and displays it on a static website built with Astro.

### Architecture

The project has three main components:

1. **Chrome Extension** (`/chrome-extension`) - Content collectors for X.com, Bilibili, and QZone
2. **Local Server** (`/server`) - Go HTTP server that receives collected content and writes Markdown files
3. **Website** (`/website`) - Astro-based static site displaying aggregated content

### Data Flow

Content flows through the system as:
- User triggers collection via Chrome extension on X/Bilibili/QZone pages
- Extension parses page DOM to extract content, metadata, and images
- Extension sends content to the local server with bearer-token auth
- Images are sent as base64 when possible; remote URLs are kept as fallback
- Local server saves Markdown files and image assets under the configured storage root
- Website reads generated/static data and builds pages
- Static site is deployed to hosting platform

## Chrome Extension Development

### Build and Test

```bash
# Compile TypeScript to JavaScript
cd chrome-extension
bun run build

# Watch mode for continuous compilation
bun run watch

# Run tests (requires build first)
bun run test
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
    └── local-server-client.ts # Local server API wrapper
```

### Testing Collectors

The collectors are tested using target HTML files in `chrome-extension/target-html/`. Tests:
1. Load compiled collector code into a simulated DOM environment (using happy-dom)
2. Run collector functions against test HTML
3. Generate or validate JSON output in `target-html/*.json`

To test after modifications:
```bash
bun run build && bun run test
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

# Build static site (automatically runs sync first via prebuild)
bun run build

# Preview production build
bun run preview

# Sync data from local synapse-data directory
bun run sync
```

### Data Source Configuration

The website reads data from the local synapse-data directory written by the Go server.
Configure the path via the `SYNAPSE_DATA_DIR` environment variable (default: `~/dev/ob/synapse-data`).

```bash
# Optional: set in .env or shell
SYNAPSE_DATA_DIR=~/dev/ob/synapse-data bun run sync
```

`bun run sync` runs `scripts/sync-from-local.ts`, which:
1. Walks `{SYNAPSE_DATA_DIR}/{year}/{month}/*.md`
2. Parses YAML front matter from each Markdown file
3. Converts to the JSON format expected by the website
4. Writes output to `public/data/`

`bun run build` automatically runs `sync` first via the `prebuild` hook.

### Project Structure

```
website/
├── astro.config.mjs          # Astro configuration
├── package.json
├── tsconfig.json
├── .env.example
├── public/
│   └── data/
│       ├── daily-counts.json          # Heatmap data (generated by sync)
│       ├── sync-metadata.json         # Last sync time and stats
│       └── thoughts-by-year/
│           ├── index.json             # Year index with counts
│           ├── 2024.json              # Thoughts for each year
│           └── ...
├── src/
│   ├── components/
│   │   ├── Heatmap.astro              # GitHub-style contribution graph
│   │   ├── LandingPage.astro          # Homepage landing page
│   │   ├── ThoughtCard.astro          # Individual thought display
│   │   └── TimelineScroll.astro       # Year/month timeline sidebar
│   ├── layouts/
│   │   └── BaseLayout.astro           # Base template
│   ├── pages/
│   │   ├── index.astro                # Landing/marketing homepage
│   │   ├── lei.astro                  # Main thoughts feed page
│   │   └── source/                    # Per-source pages
│   ├── styles/
│   │   └── global.css                 # Material Design 3 styles + CSS variables
│   ├── lib/
│   │   ├── thoughts-data.ts           # Build-time data loader (reads JSON files)
│   │   ├── notion.ts                  # Notion API client (used by sync script only)
│   │   └── firebase.ts                # Firebase auth client
│   └── env.d.ts
└── dist/                              # Built static site output
```

### Data Architecture

The website uses a **static JSON file** approach, not live Notion API calls at build/runtime:

1. `bun run sync` fetches from Notion and writes JSON files to `public/data/`
2. At build time, `src/lib/thoughts-data.ts` reads those JSON files from disk
3. At runtime (client-side), the browser fetches year JSON files lazily from `/data/thoughts-by-year/{year}.json`

Data files (all in `public/data/`):
- `thoughts-by-year/index.json` — list of years with counts
- `thoughts-by-year/{year}.json` — thoughts for that year (sorted by date desc)
- `daily-counts.json` — per-day counts for the heatmap
- `sync-metadata.json` — last sync timestamp and stats

The page also uses **Firebase Authentication** to gate content: unauthenticated users see only the first 30 thoughts; authenticated users get full access with infinite scroll.



 
 

## Local Server Development

The local server is a Go HTTP service under `server/`. It receives extension payloads and writes Markdown files plus local image assets.

```bash
cd server
go build -o synapse-server .
./synapse-server --token mysecret --storage-root /Users/lei/synapse-data
```

Core endpoints:
- `POST /collect` saves one item
- `POST /check/batch` checks duplicate URLs
- `GET /stats` returns storage/cache counts

## Key Technologies

| Component | Stack |
|-----------|-------|
| Chrome Extension | Manifest V3, TypeScript, Vanilla DOM APIs |
| Local Server | Go, net/http, Markdown + YAML Front Matter |
| Website | Astro 4, TypeScript, Material Design 3 |
| Runtime | Bun (website/scripts), Node.js (extension) |

## Development Tips

### Chrome Extension

- Use `console.log()` in content scripts and background worker—view logs via:
  - Content script: Inspect page (F12)
  - Service worker: Chrome DevTools → Extensions → click "service worker"
- The extension checks for duplicate content by URL hash to prevent re-collection
- The extension sends content to the local server configured in options (`localServerUrl`, `localServerToken`)
- Test HTML files in `target-html/` should be representative of actual page structure

### Website

- Astro pages are SSG—no client-side runtime unless explicitly using `client:*` directives
- Environment variables in `.env` are accessible via `import.meta.env` (build-time) or `process.env` (runtime)
- Notion API is only used by the sync script, not at build time or runtime
- The browser fetches year JSON files lazily from `/data/thoughts-by-year/{year}.json` as the user scrolls
- Firebase Auth gates content: unauthenticated users see 30 thoughts max

### Common Tasks

**Running specific test in extension:**
```bash
# Only run X.com collector test
bun test content/collector.test.ts -t "X.com Collector"
```

**Debugging Notion data:** Print the raw response in `scripts/sync-data.ts` to inspect Notion's API response structure. The sync script is the only place Notion is called.

**Checking website build size:**
```bash
cd website && bun run build && du -sh dist/
```

## Debugging

**Extension not showing button**: Check manifest.json `host_permissions` includes the target domain. Reload extension after manifest changes.

**Local server save fails**: Verify the server is running, the extension Local Server URL matches the server address, and the bearer token matches `--token`.
 