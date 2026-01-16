# Synapse Chrome Extension

> Collect your thoughts from X.com, Bilibili, Weibo, QZone, Redbook and ZSXQ to Notion

## Features

- 📥 **One-click collection** - Save posts from X.com, Bilibili, Weibo, QZone, Redbook and ZSXQ
- 🖼️ **Automatic image hosting** - Upload images to GitHub with jsDelivr CDN
- 📝 **Notion integration** - Store everything in a structured Notion database
- 📋 **Collection logs** - Debug and track all collection activities

## Setup

### 1. Create Notion Database

Create a new Notion database with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| Title | Title | Content title/summary |
| Content | Rich Text | Full content text |
| Source | Select | Platform (X / Bilibili / Weibo / QZone / Redbook / ZSXQ) |
| OriginalURL | URL | Link to original post |
| OriginalDate | Date | When the post was published |
| Tags | Multi-select | Optional tags |
| Status | Select | Published / Draft / Archived |

### 2. Get Notion API Token

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the "Internal Integration Token"
4. Share your database with the integration

### 3. Create GitHub Image Repository

1. Create a new **public** repository (e.g., `synapse-images`)
2. Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

### 4. Install Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` folder

### 5. Configure Extension

1. Click the Synapse extension icon
2. Click "Settings" in the footer
3. Enter your:
   - Notion API Token
   - Notion Database ID (found in the database URL)
   - GitHub Personal Access Token
   - GitHub username (Owner)
   - Repository name

## Usage

### Collecting from X.com

1. Navigate to a tweet detail page (click on a specific tweet)
2. Click the Synapse extension icon
3. Click "Collect Content"

### Collecting from Bilibili

1. Navigate to a dynamic/opus detail page
2. Click the Synapse extension icon
3. Click "Collect Content"

### Collecting from Weibo

1. Navigate to your Weibo feed or profile
2. Click the Synapse extension icon
3. Click "Collect Content"

### Collecting from QZone

1. Navigate to a QZone feed page
2. Click the Synapse extension icon
3. Click "Collect Content"

### Viewing Logs

Click the document icon in the extension popup to open the logs page.

## File Structure

```
chrome-extension/
├── manifest.json           # Extension manifest
├── icons/                  # Extension icons
├── popup/                  # Popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── logs/                   # Logs page
│   ├── logs.html
│   ├── logs.css
│   └── logs.js
├── content/                # Content scripts
│   ├── x-collector.ts
│   ├── bilibili-collector.ts
│   ├── qzone-collector.ts
│   └── weibo-collector.ts
├── background/
│   └── service-worker.js
└── lib/                    # Shared utilities
    ├── storage.js
    ├── logger.js
    ├── github-uploader.js
    └── notion-client.js
```

## Troubleshooting

### "Content already saved to Notion"
The extension checks for duplicates by URL. This means the post was already collected.

### Images not showing
Make sure your GitHub repository is **public**. Private repos won't work with jsDelivr CDN.

### "Missing configuration"
Open the extension popup and fill in all configuration fields.

## Development

The extension uses TypeScript and is built with a standard build process.

### Build & Test

```bash
# Build TypeScript to JavaScript
bun run build

# Run tests
bun run test

# Watch mode during development
bun run watch

# Package extension for distribution
bun run package
```

The `package` command will:
1. Build the TypeScript code
2. Create a `.zip` file in the `/dist` directory
3. Exclude source files (.ts) and unnecessary files
4. Generate a timestamped filename (e.g., `synapse-extension-2026-01-13T09-30-44.zip`)

The generated `.zip` file can be:
- Uploaded to Chrome Web Store
- Distributed manually for installation
- Used for version archiving

After changes, reload the extension:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Synapse extension
