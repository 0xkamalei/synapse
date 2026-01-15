export const STORAGE_KEYS = {
  NOTION_TOKEN: 'notionToken',
  NOTION_DATABASE_ID: 'notionDatabaseId',
  NOTION_DATASOURCE_ID: 'notionDataSourceId',
  GITHUB_TOKEN: 'githubToken',
  GITHUB_OWNER: 'githubOwner',
  GITHUB_REPO: 'githubRepo',
  ENABLED_SOURCES: 'enabledSources',
  TARGET_X_USER: 'targetXUser',
  TARGET_BILIBILI_USER: 'targetBilibiliUser',
  TARGET_QZONE_USER: 'targetQZoneUser',
  TARGET_WEIBO_USER: 'targetWeiboUser',
  TARGET_REDBOOK_USER: 'targetRedbookUser',
  LAST_COLLECT_TIME: 'lastCollectTime',
  LAST_COLLECT_TIMES: 'lastCollectTimes',
  COLLECT_INTERVAL_HOURS: 'collectIntervalHours',
  DEBUG_MODE: 'debugMode'
} as const;



const DEFAULT_CONFIG: Partial<AppConfig> = {
  enabledSources: ['x', 'bilibili', 'qzone', 'weibo', 'redbook'],
  debugMode: false,
  collectIntervalHours: 4
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
  const keys = Object.values(STORAGE_KEYS);
  const result = await chrome.storage.sync.get(keys);

  return {
    notionToken: (result[STORAGE_KEYS.NOTION_TOKEN] as string) || '',
    notionDatabaseId: (result[STORAGE_KEYS.NOTION_DATABASE_ID] as string) || '',
    notionDataSourceId: (result[STORAGE_KEYS.NOTION_DATASOURCE_ID] as string) || '',
    githubToken: (result[STORAGE_KEYS.GITHUB_TOKEN] as string) || '',
    githubOwner: (result[STORAGE_KEYS.GITHUB_OWNER] as string) || '',
    githubRepo: (result[STORAGE_KEYS.GITHUB_REPO] as string) || '',
    enabledSources: (result[STORAGE_KEYS.ENABLED_SOURCES] as string[]) || (DEFAULT_CONFIG.enabledSources as string[]),
    targetXUser: (result[STORAGE_KEYS.TARGET_X_USER] as string) || '',
    targetBilibiliUser: (result[STORAGE_KEYS.TARGET_BILIBILI_USER] as string) || '',
    targetQZoneUser: (result[STORAGE_KEYS.TARGET_QZONE_USER] as string) || '',
    targetWeiboUser: (result[STORAGE_KEYS.TARGET_WEIBO_USER] as string) || '',
    targetRedbookUser: (result[STORAGE_KEYS.TARGET_REDBOOK_USER] as string) || '',
    lastCollectTime: (result[STORAGE_KEYS.LAST_COLLECT_TIME] as string) || null,
    lastCollectTimes: (result[STORAGE_KEYS.LAST_COLLECT_TIMES] as Record<string, string>) || {},
    collectIntervalHours: (result[STORAGE_KEYS.COLLECT_INTERVAL_HOURS] as number) ?? (DEFAULT_CONFIG.collectIntervalHours as number),
    debugMode: (result[STORAGE_KEYS.DEBUG_MODE] as boolean) ?? (DEFAULT_CONFIG.debugMode as boolean)
  };
}

/**
 * Save all configuration values
 */
async function saveConfig(config: AppConfig): Promise<void> {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.NOTION_TOKEN]: config.notionToken,
    [STORAGE_KEYS.NOTION_DATABASE_ID]: config.notionDatabaseId,
    [STORAGE_KEYS.NOTION_DATASOURCE_ID]: config.notionDataSourceId,
    [STORAGE_KEYS.GITHUB_TOKEN]: config.githubToken,
    [STORAGE_KEYS.GITHUB_OWNER]: config.githubOwner,
    [STORAGE_KEYS.GITHUB_REPO]: config.githubRepo,
    [STORAGE_KEYS.ENABLED_SOURCES]: config.enabledSources,
    [STORAGE_KEYS.TARGET_X_USER]: config.targetXUser,
    [STORAGE_KEYS.TARGET_BILIBILI_USER]: config.targetBilibiliUser,
    [STORAGE_KEYS.TARGET_QZONE_USER]: config.targetQZoneUser,
    [STORAGE_KEYS.TARGET_WEIBO_USER]: config.targetWeiboUser,
    [STORAGE_KEYS.TARGET_REDBOOK_USER]: config.targetRedbookUser,
    [STORAGE_KEYS.COLLECT_INTERVAL_HOURS]: config.collectIntervalHours,
    [STORAGE_KEYS.DEBUG_MODE]: config.debugMode
  });
}

/**
 * Update last collect time to now
 */
async function updateLastCollectTime(source?: string): Promise<void> {
  const now = new Date().toISOString();
  const update: any = {
    [STORAGE_KEYS.LAST_COLLECT_TIME]: now
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
    missing
  };
}

export {
  getStorage,
  setStorage,
  getConfig,
  saveConfig,
  validateConfig,
  updateLastCollectTime
};
