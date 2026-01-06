/**
 * Synapse Storage Utility
 * Manages Chrome storage for configuration and data
 */

const STORAGE_KEYS = {
  NOTION_TOKEN: 'notionToken',
  NOTION_DATABASE_ID: 'notionDatabaseId',
  GITHUB_TOKEN: 'githubToken',
  GITHUB_OWNER: 'githubOwner',
  GITHUB_REPO: 'githubRepo',
  ENABLED_SOURCES: 'enabledSources',
  TARGET_X_USER: 'targetXUser',
  TARGET_BILIBILI_USER: 'targetBilibiliUser',
  COLLECT_INTERVAL_HOURS: 'collectIntervalHours',
  LAST_COLLECT_TIME: 'lastCollectTime',
  DEBUG_MODE: 'debugMode'  // Skip Notion save, just log parsed content
};

const DEFAULT_CONFIG = {
  [STORAGE_KEYS.ENABLED_SOURCES]: ['x', 'bilibili'],
  [STORAGE_KEYS.COLLECT_INTERVAL_HOURS]: 4,
  [STORAGE_KEYS.DEBUG_MODE]: false
};

/**
 * Get a value from Chrome sync storage
 * @param {string} key - Storage key
 * @returns {Promise<any>}
 */
async function getStorage(key) {
  const result = await chrome.storage.sync.get(key);
  return result[key] ?? DEFAULT_CONFIG[key] ?? null;
}

/**
 * Set a value in Chrome sync storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<void>}
 */
async function setStorage(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

/**
 * Get all configuration values
 * @returns {Promise<Object>}
 */
async function getConfig() {
  const keys = Object.values(STORAGE_KEYS);
  const result = await chrome.storage.sync.get(keys);

  return {
    notionToken: result[STORAGE_KEYS.NOTION_TOKEN] || '',
    notionDatabaseId: result[STORAGE_KEYS.NOTION_DATABASE_ID] || '',
    githubToken: result[STORAGE_KEYS.GITHUB_TOKEN] || '',
    githubOwner: result[STORAGE_KEYS.GITHUB_OWNER] || '',
    githubRepo: result[STORAGE_KEYS.GITHUB_REPO] || '',
    enabledSources: result[STORAGE_KEYS.ENABLED_SOURCES] || DEFAULT_CONFIG[STORAGE_KEYS.ENABLED_SOURCES],
    targetXUser: result[STORAGE_KEYS.TARGET_X_USER] || '',
    targetBilibiliUser: result[STORAGE_KEYS.TARGET_BILIBILI_USER] || '',
    collectIntervalHours: result[STORAGE_KEYS.COLLECT_INTERVAL_HOURS] ?? DEFAULT_CONFIG[STORAGE_KEYS.COLLECT_INTERVAL_HOURS],
    lastCollectTime: result[STORAGE_KEYS.LAST_COLLECT_TIME] || null,
    debugMode: result[STORAGE_KEYS.DEBUG_MODE] ?? DEFAULT_CONFIG[STORAGE_KEYS.DEBUG_MODE]
  };
}

/**
 * Save all configuration values
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
async function saveConfig(config) {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.NOTION_TOKEN]: config.notionToken,
    [STORAGE_KEYS.NOTION_DATABASE_ID]: config.notionDatabaseId,
    [STORAGE_KEYS.GITHUB_TOKEN]: config.githubToken,
    [STORAGE_KEYS.GITHUB_OWNER]: config.githubOwner,
    [STORAGE_KEYS.GITHUB_REPO]: config.githubRepo,
    [STORAGE_KEYS.ENABLED_SOURCES]: config.enabledSources,
    [STORAGE_KEYS.TARGET_X_USER]: config.targetXUser,
    [STORAGE_KEYS.TARGET_BILIBILI_USER]: config.targetBilibiliUser,
    [STORAGE_KEYS.COLLECT_INTERVAL_HOURS]: config.collectIntervalHours,
    [STORAGE_KEYS.DEBUG_MODE]: config.debugMode
  });
}

/**
 * Update last collect time to now
 * @returns {Promise<void>}
 */
async function updateLastCollectTime() {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.LAST_COLLECT_TIME]: new Date().toISOString()
  });
}

/**
 * Check if enough time has passed for next collection
 * If collectIntervalHours is 0, always return true (no interval control)
 * @returns {Promise<boolean>}
 */
async function shouldCollect() {
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
 * @returns {Promise<{valid: boolean, missing: string[]}>}
 */
async function validateConfig() {
  const config = await getConfig();
  const missing = [];

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
  STORAGE_KEYS,
  getStorage,
  setStorage,
  getConfig,
  saveConfig,
  validateConfig,
  updateLastCollectTime,
  shouldCollect
};
