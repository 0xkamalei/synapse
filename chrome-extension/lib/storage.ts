import { DEFAULT_ENABLED_SOURCES, PLATFORMS, ALL_PLATFORMS, PlatformKey } from './platforms.js';

// Core storage keys (non-platform specific)
export const STORAGE_KEYS = {
  NOTION_TOKEN: 'notionToken',
  NOTION_DATABASE_ID: 'notionDatabaseId',
  NOTION_DATASOURCE_ID: 'notionDataSourceId',
  GITHUB_TOKEN: 'githubToken',
  GITHUB_OWNER: 'githubOwner',
  GITHUB_REPO: 'githubRepo',
  ENABLED_SOURCES: 'enabledSources',
  LAST_COLLECT_TIME: 'lastCollectTime',
  LAST_COLLECT_TIMES: 'lastCollectTimes',
  COLLECT_INTERVAL_MINUTES: 'collectIntervalMinutes',
  DEBUG_MODE: 'debugMode',
} as const;

/**
 * Get storage key for a platform's target field
 */
function getPlatformStorageKey(platform: PlatformKey): string {
  return PLATFORMS[platform].configKey;
}

/**
 * Get all storage keys including platform-specific ones
 */
function getAllStorageKeys(): string[] {
  const coreKeys = Object.values(STORAGE_KEYS);
  const platformKeys = ALL_PLATFORMS.map((p) => getPlatformStorageKey(p));
  return [...coreKeys, ...platformKeys];
}

const DEFAULT_CONFIG: Partial<AppConfig> = {
  enabledSources: DEFAULT_ENABLED_SOURCES,
  debugMode: false,
  collectIntervalMinutes: 240,
};

/**
 * Get a value from Chrome sync storage
 */
async function getStorage<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.sync.get(key);
  return (result[key] as T) ?? (DEFAULT_CONFIG[key as keyof AppConfig] as unknown as T) ?? null;
}

/**
 * Set a value in Chrome sync storage
 */
async function setStorage(key: string, value: any): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}

/**
 * Get all configuration values
 */
async function getConfig(): Promise<AppConfig> {
  const keys = getAllStorageKeys();
  const result = await chrome.storage.sync.get(keys);

  // Build config object with core settings
  const config: any = {
    notionToken: (result[STORAGE_KEYS.NOTION_TOKEN] as string) || '',
    notionDatabaseId: (result[STORAGE_KEYS.NOTION_DATABASE_ID] as string) || '',
    notionDataSourceId: (result[STORAGE_KEYS.NOTION_DATASOURCE_ID] as string) || '',
    githubToken: (result[STORAGE_KEYS.GITHUB_TOKEN] as string) || '',
    githubOwner: (result[STORAGE_KEYS.GITHUB_OWNER] as string) || '',
    githubRepo: (result[STORAGE_KEYS.GITHUB_REPO] as string) || '',
    enabledSources:
      (result[STORAGE_KEYS.ENABLED_SOURCES] as string[]) ||
      (DEFAULT_CONFIG.enabledSources as string[]),
    lastCollectTime: (result[STORAGE_KEYS.LAST_COLLECT_TIME] as string) || null,
    lastCollectTimes: (result[STORAGE_KEYS.LAST_COLLECT_TIMES] as Record<string, string>) || {},
    collectIntervalMinutes:
      (result[STORAGE_KEYS.COLLECT_INTERVAL_MINUTES] as number) ??
      (DEFAULT_CONFIG.collectIntervalMinutes as number),
    debugMode:
      (result[STORAGE_KEYS.DEBUG_MODE] as boolean) ?? (DEFAULT_CONFIG.debugMode as boolean),
  };

  // Dynamically add platform-specific config values
  for (const platform of ALL_PLATFORMS) {
    const storageKey = getPlatformStorageKey(platform);
    const configKey = PLATFORMS[platform].configKey;
    config[configKey] = (result[storageKey] as string) || '';
  }

  return config as AppConfig;
}

/**
 * Save all configuration values
 */
async function saveConfig(config: AppConfig): Promise<void> {
  // Build the storage object with core settings
  const storageData: Record<string, any> = {
    [STORAGE_KEYS.NOTION_TOKEN]: config.notionToken,
    [STORAGE_KEYS.NOTION_DATABASE_ID]: config.notionDatabaseId,
    [STORAGE_KEYS.NOTION_DATASOURCE_ID]: config.notionDataSourceId,
    [STORAGE_KEYS.GITHUB_TOKEN]: config.githubToken,
    [STORAGE_KEYS.GITHUB_OWNER]: config.githubOwner,
    [STORAGE_KEYS.GITHUB_REPO]: config.githubRepo,
    [STORAGE_KEYS.ENABLED_SOURCES]: config.enabledSources,
    [STORAGE_KEYS.COLLECT_INTERVAL_MINUTES]: config.collectIntervalMinutes,
    [STORAGE_KEYS.DEBUG_MODE]: config.debugMode,
  };

  // Dynamically add platform-specific config values
  for (const platform of ALL_PLATFORMS) {
    const storageKey = getPlatformStorageKey(platform);
    const configKey = PLATFORMS[platform].configKey;
    storageData[storageKey] = config[configKey] || [];
  }

  await chrome.storage.sync.set(storageData);
}

/**
 * Update last collect time to now
 */
async function updateLastCollectTime(source?: string): Promise<void> {
  const now = new Date().toISOString();
  const update: any = {
    [STORAGE_KEYS.LAST_COLLECT_TIME]: now,
  };

  if (source) {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.LAST_COLLECT_TIMES);
    const times = result[STORAGE_KEYS.LAST_COLLECT_TIMES] || {};
    times[source.toLowerCase()] = now;
    update[STORAGE_KEYS.LAST_COLLECT_TIMES] = times;
  }

  await chrome.storage.sync.set(update);
}

/**
 * Check if configuration is complete
 */
async function validateConfig(): Promise<{ valid: boolean; missing: string[] }> {
  const config = await getConfig();
  const missing: string[] = [];

  if (!config.notionToken) missing.push('Notion Token');
  if (!config.notionDataSourceId) missing.push('Notion Data Source ID');
  if (!config.githubToken) missing.push('GitHub Token');
  if (!config.githubOwner) missing.push('GitHub Owner');
  if (!config.githubRepo) missing.push('GitHub Repo');

  return {
    valid: missing.length === 0,
    missing,
  };
}

export { getStorage, setStorage, getConfig, saveConfig, validateConfig, updateLastCollectTime };
