#!/usr/bin/env bun
/**
 * sync-from-local.ts
 *
 * Reads Markdown files from the local synapse-data directory (written by the
 * Go server) and converts them into the JSON format expected by the website.
 *
 * Local images are copied to public/data/images/{year}/{month}/ and their
 * paths are rewritten to /data/images/... so they are served by the static site.
 * Remote fallback URLs (CDN links) are used as-is.
 *
 * Output files (written to public/data/):
 *   thoughts-by-year/index.json        — year list with counts
 *   thoughts-by-year/{year}.json       — thoughts for each year, sorted desc
 *   images/{year}/{month}/{file}       — copied local images
 *   daily-counts.json                  — per-day counts for the heatmap
 *   sync-metadata.json                 — last sync time and stats
 *
 * Configuration:
 *   SYNAPSE_DATA_DIR  — path to synapse-data root (default: ~/dev/ob/synapse-data)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEBSITE_ROOT = path.join(__dirname, "..");
const PUBLIC_DATA_DIR = path.join(WEBSITE_ROOT, "public", "data");
const THOUGHTS_BY_YEAR_DIR = path.join(PUBLIC_DATA_DIR, "thoughts-by-year");
const PUBLIC_IMAGES_DIR = path.join(PUBLIC_DATA_DIR, "images");

function resolveDataDir(): string {
  const envVal = process.env.SYNAPSE_DATA_DIR;
  if (envVal) {
    return envVal.startsWith("~")
      ? path.join(os.homedir(), envVal.slice(1))
      : envVal;
  }
  return path.join(os.homedir(), "dev", "ob", "synapse-data");
}

const DATA_DIR = resolveDataDir();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape stored in the year JSON files (consumed by the website). */
interface Thought {
  id: string;
  hashId: string;
  title: string;
  content: string;
  source: string;
  originalUrl: string;
  originalDate: string;
  images: string[];
  videos: string[];
  links: string[];
  tags: string[];
  authorUsername: string;
  authorDisplayName: string;
  collectedAt: string;
}

/** Raw YAML front matter fields from the Markdown file. */
interface FrontMatter {
  id?: string;
  hash_id?: string;
  source?: string;
  type?: string;
  title?: string;
  url?: string;
  original_date?: string;
  collected_at?: string;
  author_username?: string;
  author_display_name?: string;
  tags?: string[];
  images?: string[];
  images_remote_fallback?: string[];
  videos?: string[];
  links?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Minimal YAML front matter parser
// Handles the subset of YAML produced by the Go server's buildMarkdown().
// ---------------------------------------------------------------------------

function parseFrontMatter(raw: string): { fm: FrontMatter; body: string } {
  const fm: FrontMatter = {};

  if (!raw.startsWith("---")) {
    return { fm, body: raw };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { fm, body: raw };
  }

  const fmBlock = raw.slice(4, end); // skip opening "---\n"
  const body = raw.slice(end + 4).trimStart(); // skip closing "\n---"

  const lines = fmBlock.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const rest = kvMatch[2].trim();

    if (rest === "") {
      // Collect list items on following indented lines
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        const itemMatch = lines[i].match(/^\s+-\s+"?([^"]*)"?\s*$/);
        if (itemMatch) {
          items.push(unquote(itemMatch[1]));
        }
        i++;
      }
      (fm as Record<string, unknown>)[key] = items;
      continue;
    }

    (fm as Record<string, unknown>)[key] = unquote(rest);
    i++;
  }

  return { fm, body };
}

/** Remove surrounding double-quotes from a YAML scalar value. */
function unquote(s: string): string {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

/**
 * Resolve the display URL for a single image entry.
 *
 * - If the value is already an absolute URL (http/https), return it as-is.
 * - If it's a relative local path (e.g. "images/abc_0.jpg"), copy the file
 *   to public/data/images/{year}/{month}/ and return the web-accessible path.
 */
function resolveImage(
  imgValue: string,
  monthPath: string,
  year: string,
  month: string,
  imagesCopied: { count: number }
): string | null {
  if (imgValue.startsWith("http://") || imgValue.startsWith("https://")) {
    return imgValue;
  }

  // Local relative path — resolve against the month directory
  const srcPath = path.join(monthPath, imgValue);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[sync] Local image not found, skipping: ${srcPath}`);
    return null;
  }

  const filename = path.basename(imgValue);
  const destDir = path.join(PUBLIC_IMAGES_DIR, year, month);
  const destPath = path.join(destDir, filename);

  // Only copy if the destination doesn't exist or source is newer
  let shouldCopy = true;
  if (fs.existsSync(destPath)) {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    const destMtime = fs.statSync(destPath).mtimeMs;
    shouldCopy = srcMtime > destMtime;
  }

  if (shouldCopy) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    imagesCopied.count++;
  }

  return `/data/images/${year}/${month}/${filename}`;
}

/**
 * Build the final images array for a thought.
 *
 * Strategy:
 * 1. Process fm.images — copy local files, keep remote URLs as-is.
 * 2. For any local image that failed to copy, fall back to the corresponding
 *    entry in fm.images_remote_fallback (by index) if available.
 * 3. Append any remote fallbacks that have no corresponding local entry.
 */
function buildImageList(
  fm: FrontMatter,
  monthPath: string,
  year: string,
  month: string,
  imagesCopied: { count: number }
): string[] {
  const localEntries: string[] = Array.isArray(fm.images) ? fm.images : [];
  const remoteFallbacks: string[] = Array.isArray(fm.images_remote_fallback)
    ? fm.images_remote_fallback
    : [];

  const result: string[] = [];

  for (let i = 0; i < localEntries.length; i++) {
    const resolved = resolveImage(
      localEntries[i],
      monthPath,
      year,
      month,
      imagesCopied
    );

    if (resolved !== null) {
      result.push(resolved);
    } else if (i < remoteFallbacks.length) {
      // Local file missing — use the remote fallback at the same index
      result.push(remoteFallbacks[i]);
    }
  }

  // Append any extra remote fallbacks beyond the local entries count
  // (this handles the case where there are no local images at all)
  for (let i = localEntries.length; i < remoteFallbacks.length; i++) {
    result.push(remoteFallbacks[i]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Convert a parsed Markdown file into a Thought
// ---------------------------------------------------------------------------

function mdToThought(
  fm: FrontMatter,
  body: string,
  monthPath: string,
  year: string,
  month: string,
  imagesCopied: { count: number }
): Thought | null {
  const id = fm.id ?? "";
  const hashId = fm.hash_id ?? "";
  const source = fm.source ?? "";
  const originalDate = fm.original_date ?? "";

  if (!id || !source || !originalDate) {
    return null;
  }

  // Strip inline image markdown from body (already captured in fm.images)
  const content = body.replace(/\n!\[image\]\([^)]+\)\n/g, "").trim();

  const images = buildImageList(fm, monthPath, year, month, imagesCopied);

  return {
    id,
    hashId,
    title: fm.title ?? "",
    content,
    source,
    originalUrl: fm.url ?? "",
    originalDate,
    images,
    videos: Array.isArray(fm.videos) ? fm.videos : [],
    links: Array.isArray(fm.links) ? fm.links : [],
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    authorUsername: fm.author_username ?? "",
    authorDisplayName: fm.author_display_name ?? "",
    collectedAt: fm.collected_at ?? "",
  };
}

// ---------------------------------------------------------------------------
// Walk the data directory and collect all thoughts
// ---------------------------------------------------------------------------

function collectAllThoughts(): Thought[] {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`[sync] Data directory not found: ${DATA_DIR}`);
    console.error(`[sync] Set SYNAPSE_DATA_DIR environment variable to override.`);
    process.exit(1);
  }

  const thoughts: Thought[] = [];
  const imagesCopied = { count: 0 };
  let filesRead = 0;
  let filesSkipped = 0;

  const yearDirs = fs
    .readdirSync(DATA_DIR)
    .filter((name) => /^\d{4}$/.test(name))
    .sort();

  for (const year of yearDirs) {
    const yearPath = path.join(DATA_DIR, year);
    if (!fs.statSync(yearPath).isDirectory()) continue;

    const monthDirs = fs
      .readdirSync(yearPath)
      .filter((name) => /^\d{2}$/.test(name))
      .sort();

    for (const month of monthDirs) {
      const monthPath = path.join(yearPath, month);
      if (!fs.statSync(monthPath).isDirectory()) continue;

      const mdFiles = fs
        .readdirSync(monthPath)
        .filter((name) => name.endsWith(".md"))
        .sort();

      for (const mdFile of mdFiles) {
        const mdPath = path.join(monthPath, mdFile);
        try {
          const raw = fs.readFileSync(mdPath, "utf-8");
          const { fm, body } = parseFrontMatter(raw);
          const thought = mdToThought(fm, body, monthPath, year, month, imagesCopied);
          if (thought) {
            thoughts.push(thought);
            filesRead++;
          } else {
            filesSkipped++;
          }
        } catch (err) {
          console.warn(`[sync] Failed to parse ${mdPath}: ${err}`);
          filesSkipped++;
        }
      }
    }
  }

  console.log(
    `[sync] Read ${filesRead} thoughts, skipped ${filesSkipped} files, copied ${imagesCopied.count} images.`
  );
  return thoughts;
}

// ---------------------------------------------------------------------------
// Write output JSON files
// ---------------------------------------------------------------------------

function writeOutputFiles(thoughts: Thought[]): void {
  fs.mkdirSync(THOUGHTS_BY_YEAR_DIR, { recursive: true });

  thoughts.sort((a, b) => b.originalDate.localeCompare(a.originalDate));

  const byYear = new Map<string, Thought[]>();
  const dailyCounts = new Map<string, number>();

  for (const t of thoughts) {
    const year = t.originalDate.slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;

    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(t);

    const day = t.originalDate.slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }

  const index: { year: string; file: string; count: number }[] = [];

  for (const [year, yearThoughts] of [...byYear.entries()].sort((a, b) =>
    b[0].localeCompare(a[0])
  )) {
    const file = `${year}.json`;
    fs.writeFileSync(
      path.join(THOUGHTS_BY_YEAR_DIR, file),
      JSON.stringify(yearThoughts, null, 2),
      "utf-8"
    );
    index.push({ year, file, count: yearThoughts.length });
    console.log(`[sync] Wrote ${yearThoughts.length} thoughts → ${file}`);
  }

  fs.writeFileSync(
    path.join(THOUGHTS_BY_YEAR_DIR, "index.json"),
    JSON.stringify(index, null, 2),
    "utf-8"
  );

  const dailyCountsArray = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, "daily-counts.json"),
    JSON.stringify(dailyCountsArray, null, 2),
    "utf-8"
  );

  const metadata = {
    lastSync: new Date().toISOString(),
    totalThoughts: thoughts.length,
    years: index.length,
    source: "local",
    dataDir: DATA_DIR,
  };

  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, "sync-metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8"
  );

  console.log(
    `[sync] Done. Total: ${thoughts.length} thoughts across ${index.length} years.`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`[sync] Reading from: ${DATA_DIR}`);
const thoughts = collectAllThoughts();
writeOutputFiles(thoughts);
