export const STORAGE_KEYS = {
  NOTION_TOKEN: 'notionToken',
  NOTION_DATABASE_ID: 'notionDatabaseId',
  GITHUB_TOKEN: 'githubToken',
  GITHUB_OWNER: 'githubOwner',
  GITHUB_REPO: 'githubRepo',
  ENABLED_SOURCES: 'enabledSources',
  TARGET_X_USER: 'targetXUser',
  TARGET_BILIBILI_USER: 'targetBilibiliUser',
  TARGET_QZONE_USER: 'targetQZoneUser',
  COLLECT_INTERVAL_HOURS: 'collectIntervalHours',
  LAST_COLLECT_TIME: 'lastCollectTime',
  DEBUG_MODE: 'debugMode'
} as const;



const DEFAULT_CONFIG: Partial<AppConfig> = {
  enabledSources: ['x', 'bilibili', 'qzone'],
  collectIntervalHours: 4,
  debugMode: false
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
    githubToken: (result[STORAGE_KEYS.GITHUB_TOKEN] as string) || '',
    githubOwner: (result[STORAGE_KEYS.GITHUB_OWNER] as string) || '',
    githubRepo: (result[STORAGE_KEYS.GITHUB_REPO] as string) || '',
    enabledSources: (result[STORAGE_KEYS.ENABLED_SOURCES] as string[]) || (DEFAULT_CONFIG.enabledSources as string[]),
    targetXUser: (result[STORAGE_KEYS.TARGET_X_USER] as string) || '',
    targetBilibiliUser: (result[STORAGE_KEYS.TARGET_BILIBILI_USER] as string) || '',
    targetQZoneUser: (result[STORAGE_KEYS.TARGET_QZONE_USER] as string) || '',
    collectIntervalHours: (result[STORAGE_KEYS.COLLECT_INTERVAL_HOURS] as number) ?? (DEFAULT_CONFIG.collectIntervalHours as number),
    lastCollectTime: (result[STORAGE_KEYS.LAST_COLLECT_TIME] as string) || null,
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
    [STORAGE_KEYS.GITHUB_TOKEN]: config.githubToken,
    [STORAGE_KEYS.GITHUB_OWNER]: config.githubOwner,
    [STORAGE_KEYS.GITHUB_REPO]: config.githubRepo,
    [STORAGE_KEYS.ENABLED_SOURCES]: config.enabledSources,
    [STORAGE_KEYS.TARGET_X_USER]: config.targetXUser,
    [STORAGE_KEYS.TARGET_BILIBILI_USER]: config.targetBilibiliUser,
    [STORAGE_KEYS.TARGET_QZONE_USER]: config.targetQZoneUser,
    [STORAGE_KEYS.COLLECT_INTERVAL_HOURS]: config.collectIntervalHours,
    [STORAGE_KEYS.DEBUG_MODE]: config.debugMode
  });
}

/**
 * Update last collect time to now
 */
async function updateLastCollectTime(): Promise<void> {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.LAST_COLLECT_TIME]: new Date().toISOString()
  });
}

/**
 * Check if enough time has passed for next collection
 */
async function shouldCollect(): Promise<boolean> {
  const config = await getConfig();

  // If interval is 0, disable control
  if (config.collectIntervalHours === 0) {
    return true;
  }

  if (!config.lastCollectTime) {
    return true; // Never collected before
  }

  const lastTime = new Date(config.lastCollectTime).getTime();
  const now = Date.now();
  const hoursSinceLastCollect = (now - lastTime) / (1000 * 60 * 60);

  return hoursSinceLastCollect >= config.collectIntervalHours;
}

/**
 * Check if configuration is complete
 */
async function validateConfig(): Promise<{ valid: boolean; missing: string[] }> {
  const config = await getConfig();
  const missing: string[] = [];

  if (!config.notionToken) missing.push('Notion Token');
  if (!config.notionDatabaseId) missing.push('Notion Database ID');
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
  updateLastCollectTime,
  shouldCollect
};
