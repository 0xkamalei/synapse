import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Thought = {
  id?: string;
  hashId?: string;
  source: string;
  originalDate: string;
  [key: string]: any;
};

export type ThoughtYearMeta = {
  year: string;
  file: string;
  count: number;
};

export type DailyCount = {
  date: string;
  count: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEBSITE_ROOT_DIR = path.join(__dirname, "../..");
const DATA_DIR = path.join(__dirname, "../data");
const PUBLIC_DATA_DIR = path.join(WEBSITE_ROOT_DIR, "public", "data");
const THOUGHTS_BY_YEAR_DIR = path.join(
  PUBLIC_DATA_DIR,
  "thoughts-by-year",
);
const THOUGHTS_INDEX_FILE = path.join(THOUGHTS_BY_YEAR_DIR, "index.json");
const DAILY_COUNTS_FILE = path.join(PUBLIC_DATA_DIR, "daily-counts.json");
const LEGACY_THOUGHTS_FILE = path.join(DATA_DIR, "thoughts.json");

function compareByDateDesc(a: Thought, b: Thought): number {
  return b.originalDate.localeCompare(a.originalDate);
}

function normalizeThoughtYearMeta(raw: any[]): ThoughtYearMeta[] {
  return raw
    .filter((item) => item && (item.year || item.file))
    .map((item) => {
      const year = String(item.year || "").trim();
      const file = String(item.file || `${year}.json`).trim();
      const count = Number(item.count) || 0;

      return { year, file, count };
    })
    .filter((item) => item.year.length > 0 && item.file.length > 0)
    .sort((a, b) => b.year.localeCompare(a.year));
}

export function loadThoughtsIndex(): ThoughtYearMeta[] {
  if (!fs.existsSync(THOUGHTS_INDEX_FILE)) {
    return [];
  }

  try {
    const content = fs.readFileSync(THOUGHTS_INDEX_FILE, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? normalizeThoughtYearMeta(parsed) : [];
  } catch (error) {
    console.warn("Could not parse thoughts-by-year/index.json, fallback to runtime grouping.");
    return [];
  }
}

export function buildThoughtYearMeta(thoughts: Thought[]): ThoughtYearMeta[] {
  const yearCounts = new Map<string, number>();

  for (const thought of thoughts) {
    const year = String(thought.originalDate || "").slice(0, 4);
    if (!/^\d{4}$/.test(year)) {
      continue;
    }
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  }

  return Array.from(yearCounts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, count]) => ({
      year,
      file: `${year}.json`,
      count,
    }));
}

function loadThoughtFile(filePath: string): Thought[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Could not parse thoughts file: ${filePath}`);
    return [];
  }
}

export async function loadAllThoughts(): Promise<Thought[]> {
  const thoughtYearMeta = loadThoughtsIndex();

  if (thoughtYearMeta.length > 0) {
    const thoughts = thoughtYearMeta
      .flatMap((entry) => loadThoughtFile(path.join(THOUGHTS_BY_YEAR_DIR, entry.file)))
      .sort(compareByDateDesc);
    return thoughts;
  }

  if (fs.existsSync(LEGACY_THOUGHTS_FILE)) {
    return loadThoughtFile(LEGACY_THOUGHTS_FILE).sort(compareByDateDesc);
  }

  return [];
}

export async function loadDailyCounts(): Promise<DailyCount[]> {
  if (!fs.existsSync(DAILY_COUNTS_FILE)) {
    return [];
  }

  const counts = loadThoughtFile(DAILY_COUNTS_FILE);
  return counts
    .filter((item) => typeof item?.date === "string")
    .map((item) => ({
      date: String(item.date),
      count: Number(item.count) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
