# Synapse Local Server — API Specification

## Overview

A lightweight HTTP server (written in **Go**) that runs as a local daemon on
the developer's machine. It receives `CollectedContent` payloads from the
Synapse Chrome extension and persists each item as a **Markdown file with YAML
Front Matter**. Images are sent as **base64** by the extension and saved to
local disk by the server.

> **Why Go?**  
> Single static binary, ~5–10 MB idle RSS, capable stdlib HTTP server.

---

## File Layout

```
<storage_root>/
└── <year>/              # 2026
    └── <month>/         # 05
        ├── <day>-<platform>-<title-or-content>.md
        └── images/
            └── <short_id>_<n>.<ext>   # Saved images

Markdown filenames are readable. The title part uses `title` when present;
otherwise it uses the first 8 characters of `text`. If two different items
resolve to the same filename, the server appends the first 8 characters of the
SHA-256 URL hash.
```

### Markdown File Format

```markdown
---
id: "aa1783c36ca7450f"
hash_id: "aa1783c36ca7450f0372106d3630ec..."  # full SHA-256 of URL
source: "X"
type: "text"
title: "A readable post title"
url: "https://x.com/user/status/12345"
original_date: "2026-05-14T08:00:00Z"
collected_at: "2026-05-14T15:30:00+08:00"
author_username: "kamalei"
author_display_name: "Kamal Lei"
tags:
  - "ai"
  - "tools"
images:
  - "images/aa1783c36ca7450f_0.jpg"
images_remote_fallback:    # only present if base64 decode failed
  - "https://pbs.twimg.com/..."
videos:
  - "https://video.twimg.com/..."
links:
  - "https://example.com"
status: "collected"
server_version: "1"
---

Post text content here.

![image](images/aa1783c36ca7450f_0.jpg)
```

---

## Authentication

Every request (except `/health`) must carry:

```
Authorization: Bearer <token>
```

Token is set via `--token` flag. Returns **401** on mismatch.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | ❌ | Health check + uptime + cache size |
| `POST` | `/collect` | ✅ | Save one item |
| `POST` | `/collect/batch` | ✅ | Save multiple items |
| `GET` | `/check?url=...` | ✅ | Single URL dedup check |
| `POST` | `/check/batch` | ✅ | Batch URL dedup check |
| `GET` | `/stats` | ✅ | Storage statistics |

### `POST /collect` — Request Body

```jsonc
{
  "source":      "X",                       // required
  "type":        "text",                    // optional: text|image|video|article
  "title":       "A readable post title",   // optional, used in filename
  "text":        "Post text...",            // required
  "url":         "https://x.com/...",      // required (dedup key)
  "timestamp":   "2026-05-14T08:00:00Z",  // required (ISO 8601)
  "collectedAt": "2026-05-14T15:30:00+08:00", // required
  "author": { "username": "...", "displayName": "..." },
  "tags":   ["ai"],
  "images": [
    {
      "data":         "base64encodedBytes...",  // base64 image
      "mime_type":    "image/jpeg",
      "original_url": "https://..."            // kept as fallback reference
    }
  ],
  "videos": ["https://video.twimg.com/..."],
  "links":  ["https://example.com"]
}
```

### Responses

| Status | Meaning |
|--------|---------|
| 200 | `{"status":"saved","id":"...","path":"2026/05/14-x-readable-title.md","images_downloaded":2}` |
| 409 | `{"status":"duplicate","id":"...","message":"content already exists"}` |
| 400 | `{"error":"missing required field: url"}` |
| 401 | `{"error":"unauthorized"}` |
| 500 | `{"error":"..."}` |

### `POST /check/batch` — Request / Response

```json
// Request
{ "urls": ["https://...", "https://..."] }

// Response
{ "existing": ["https://..."] }
```

---

## CLI Flags

```
--token        string   Bearer token for auth (required)
--storage-root string   Root directory for Markdown files (required)
--port         int      Listen port (default 7070)
--host         string   Bind address (default 127.0.0.1)
--log-level    string   debug|info|warn|error (default info)
--config       string   Path to optional config.yaml
```

## `config.yaml` (optional)

```yaml
token: "your-secret-token"
storage_root: "/Users/lei/synapse-data"
port: 7070
host: "127.0.0.1"
log_level: "info"
```

CLI flags take priority over YAML values.

---

## Startup — ID Cache

On startup, the server walks all `*.md` files under `storage_root`, reads
`hash_id` from each file's YAML front matter using a **bounded goroutine pool
(max 4 workers)**, and loads them into `map[string]struct{}`.

- **Write-through**: every successful save immediately adds to cache.
- **No persistence file**: rebuilt from disk on restart for consistency.
- Memory: ~32 bytes/entry → 100k entries ≈ 3 MB.

---

## Image Handling

Images are sent as **base64** payloads by the Chrome extension. The server:

1. Decodes base64 → saves to `images/<short_id>_<n>.<ext>`
2. Rewrites front matter `images` array to relative local paths
3. If decode/write fails → keeps `original_url` in `images_remote_fallback`
4. Item is **always saved** even if images fail

---

## Running

```bash
# Build
cd server
go build -o synapse-server .

# Run
./synapse-server --token mysecret --storage-root /Users/lei/synapse-data

# With config file
./synapse-server --config config.yaml

# Install as macOS LaunchAgent (auto-start at login)
cp com.synapse.server.plist ~/Library/LaunchAgents/
# Edit the plist to set your token and storage-root, then:
launchctl load ~/Library/LaunchAgents/com.synapse.server.plist
```

---

## Source Files

```
server/
├── SPEC.md                    # This file
├── main.go                    # Entry point, flags, routing, graceful shutdown
├── config.go                  # Config struct + YAML loader
├── handler.go                 # HTTP handlers
├── storage.go                 # Markdown writer + base64 image saver
├── cache.go                   # In-memory ID cache + disk scanner
├── hash.go                    # SHA-256 URL hashing
├── middleware.go              # Auth + request logging middleware
├── go.mod / go.sum
├── config.example.yaml        # Example config file
└── com.synapse.server.plist   # macOS LaunchAgent descriptor
```
