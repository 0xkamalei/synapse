import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const args = parseArgs(process.argv.slice(2));
const inputDir = path.resolve(repoRoot, args.input ?? 'website/public/data/thoughts-by-year');
const outputDir = path.resolve(repoRoot, args.output ?? 'data');
const clean = Boolean(args.clean);
const dryRun = Boolean(args['dry-run']);

if (!existsSync(inputDir)) {
  console.error(`Input directory does not exist: ${inputDir}`);
  process.exit(1);
}

if (clean && existsSync(outputDir) && !dryRun) {
  rmSync(outputDir, { recursive: true, force: true });
}

const yearFiles = readdirSync(inputDir)
  .filter((file) => /^\d{4}\.json$/.test(file))
  .sort();

let converted = 0;
let skipped = 0;
let duplicates = 0;
const bySource = new Map();
const writtenTargets = new Set();
const writtenHashes = new Set();

for (const file of yearFiles) {
  const thoughts = JSON.parse(readFileSync(path.join(inputDir, file), 'utf8'));
  if (!Array.isArray(thoughts)) {
    console.warn(`Skipping non-array file: ${file}`);
    continue;
  }

  for (const thought of thoughts) {
    const normalized = normalizeThought(thought);
    if (!normalized) {
      skipped++;
      continue;
    }

    if (writtenHashes.has(normalized.hashID)) {
      duplicates++;
      continue;
    }
    writtenHashes.add(normalized.hashID);

    const monthDir = path.join(outputDir, normalized.year, normalized.month);
    const mdFilename = uniqueMarkdownFilename(normalized, monthDir);
    const mdPath = path.join(monthDir, mdFilename);
    const md = buildMarkdown(normalized);
    writtenTargets.add(path.relative(outputDir, mdPath));

    if (!dryRun) {
      mkdirSync(path.join(monthDir, 'images'), { recursive: true });
      writeFileSync(mdPath, md, 'utf8');
    }

    converted++;
    bySource.set(normalized.source, (bySource.get(normalized.source) ?? 0) + 1);
  }
}

console.log(`${dryRun ? 'Would convert' : 'Converted'} ${converted} thoughts into ${outputDir}`);
if (skipped > 0) {
  console.log(`Skipped ${skipped} thoughts with missing content, URL, or source`);
}
if (duplicates > 0) {
  console.log(`Skipped ${duplicates} duplicate target files`);
}
console.log('By source:');
for (const [source, count] of [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${source}: ${count}`);
}

function normalizeThought(thought) {
  const source = stringOrEmpty(thought.source);
  const url = stringOrEmpty(thought.originalUrl);
  const text = stringOrEmpty(thought.content || thought.title);

  if (!source || !url || !text) {
    return null;
  }

  const originalDate = stringOrEmpty(thought.originalDate) || stringOrEmpty(thought.createdAt) || new Date().toISOString();
  const collectedAt = stringOrEmpty(thought.createdAt) || new Date().toISOString();
  const date = parseDate(originalDate) ?? parseDate(collectedAt) ?? new Date();
  const hashID = validHashID(thought.hashId) ? thought.hashId.toLowerCase() : hashURL(url);
  const shortID = hashID.slice(0, 16);
  const images = stringArray(thought.images);
  const videos = stringArray(thought.videos);
  const title = stringOrEmpty(thought.title);

  return {
    id: shortID,
    shortID,
    hashID,
    source,
    platform: source.toLowerCase(),
    type: inferType(text, images, videos),
    title,
    url,
    originalDate,
    collectedAt,
    tags: stringArray(thought.tags),
    remoteImages: images,
    videos,
    links: [],
    text,
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
  };
}

function buildMarkdown(item) {
  const lines = ['---'];
  writeField(lines, 'id', item.id);
  writeField(lines, 'hash_id', item.hashID);
  writeField(lines, 'source', item.source);
  writeField(lines, 'type', item.type);
  writeField(lines, 'title', item.title);
  writeField(lines, 'url', item.url);
  writeField(lines, 'original_date', item.originalDate);
  writeField(lines, 'collected_at', item.collectedAt);
  writeList(lines, 'tags', item.tags);
  writeList(lines, 'images_remote_fallback', item.remoteImages);
  writeList(lines, 'videos', item.videos);
  writeList(lines, 'links', item.links);
  lines.push('status: "collected"');
  lines.push('server_version: "1"');
  lines.push('---');
  lines.push('');
  lines.push(item.text);
  lines.push('');

  return lines.join('\n');
}

function uniqueMarkdownFilename(item) {
  const platform = slugify(item.platform, 24) || 'unknown';
  const titleSource = item.title || firstChars(item.text, 8);
  const maxTitleChars = item.title ? 64 : 8;
  const title = slugify(titleSource, maxTitleChars) || item.shortID.slice(0, 8);
  const base = `${item.day}-${platform}-${title}`;
  const filename = `${base}.md`;

  if (!writtenTargets.has(path.join(item.year, item.month, filename))) {
    return filename;
  }
  return `${base}-${item.shortID.slice(0, 8)}.md`;
}

function slugify(value, maxChars) {
  const chars = [];
  let lastWasDash = false;

  for (const char of String(value).trim()) {
    if (chars.length >= maxChars) {
      break;
    }

    if (/[\s/\\:*?"<>|#%&{}$!'@+`=，。、；：？！]/u.test(char)) {
      if (chars.length > 0 && !lastWasDash) {
        chars.push('-');
        lastWasDash = true;
      }
      continue;
    }

    if (/[\p{Cc}\p{Cf}]/u.test(char)) {
      continue;
    }

    chars.push(char);
    lastWasDash = false;
  }

  return chars.join('').replace(/^-+|-+$/g, '').replace(/^\.+|\.+$/g, '');
}

function firstChars(value, maxChars) {
  return [...String(value).trim()].slice(0, maxChars).join('');
}

function writeField(lines, key, value) {
  if (value) {
    lines.push(`${key}: ${yamlQuote(value)}`);
  }
}

function writeList(lines, key, values) {
  if (!values.length) {
    return;
  }
  lines.push(`${key}:`);
  for (const value of values) {
    lines.push(`  - ${yamlQuote(value)}`);
  }
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function hashURL(url) {
  return createHash('sha256').update(url).digest('hex');
}

function validHashID(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value);
}

function inferType(text, images, videos) {
  if (videos.length > 0) {
    return 'video';
  }
  if (images.length > 0 && text.trim().length === 0) {
    return 'image';
  }
  return 'text';
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => stringOrEmpty(item)).filter(Boolean)
    : [];
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [rawKey, rawValue] = arg.slice(2).split('=', 2);
    if (rawValue !== undefined) {
      parsed[rawKey] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      parsed[rawKey] = next;
      i++;
    } else {
      parsed[rawKey] = true;
    }
  }
  return parsed;
}
