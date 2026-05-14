# Synapse Chrome Extension

> Collect your thoughts from X.com, Bilibili, Weibo, QZone, Redbook, ZSXQ and YouTube to a local Synapse server.

## Features

- One-click collection from supported social platforms
- Local server integration via `POST /collect`
- Local image persistence: images are sent as base64 when possible, with remote URL fallback
- Duplicate checks via local hash cache plus the local server `/check/batch` endpoint
- Collection logs for debugging

## Setup

### 1. Start the Local Server

Build and run the server from the repository root:

```bash
cd server
go build -o synapse-server .
./synapse-server --token mysecret --storage-root /Users/lei/synapse-data
```

The extension defaults to `http://127.0.0.1:7070`. See [server/SPEC.md](../server/SPEC.md) for the full API and server configuration.

### 2. Install Extension

```bash
cd chrome-extension
npm install
npm run build
```

Then:

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` folder

### 3. Configure Extension

1. Click the Synapse extension icon
2. Click "Settings" in the footer
3. Set:
   - Local Server URL, for example `http://127.0.0.1:7070`
   - Bearer Token, matching the server `--token`
   - Target accounts/groups for the platforms you want to collect

## Usage

1. Navigate to a supported platform page.
2. Click the Synapse extension icon.
3. Click "Collect Content".
4. Open the logs page from the popup to inspect saved items and local server paths.

## File Structure

```text
chrome-extension/
├── manifest.json
├── popup/
├── logs/
├── options/
├── content/
├── background/
│   └── service-worker.ts
└── lib/
    ├── storage.ts
    ├── logger.ts
    └── local-server-client.ts
```

## Troubleshooting

### "Content already saved"

The extension checks duplicates by URL hash. The post was already collected locally or exists in the server cache.

### "Missing configuration"

Open the extension options page and fill in Local Server URL and Bearer Token.

### Images appear as remote fallbacks

The extension could not fetch or convert the image before sending it to the server. The server still saves the content and records the original image URL as a fallback.

## Development

```bash
npm run build
npm run test
npm run watch
```

After changes, reload the extension from `chrome://extensions/`.
