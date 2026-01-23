/**
 * Synapse Options Page
 * Configuration UI for the extension
 */

import { getConfig, saveConfig } from '../lib/storage.js';
import {
  PLATFORMS,
  PlatformKey,
  DEFAULT_ENABLED_SOURCES,
  ALL_PLATFORMS,
} from '../lib/platforms.js';

// Helper function to get element by id with type assertion
function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// DOM Elements - Core settings
const coreElements = {
  notionToken: getEl<HTMLInputElement>('notionToken'),
  notionDatabaseId: getEl<HTMLInputElement>('notionDatabaseId'),
  notionDataSourceId: getEl<HTMLInputElement>('notionDataSourceId'),
  githubToken: getEl<HTMLInputElement>('githubToken'),
  githubOwner: getEl<HTMLInputElement>('githubOwner'),
  githubRepo: getEl<HTMLInputElement>('githubRepo'),
  collectIntervalHours: getEl<HTMLInputElement>('collectIntervalHours'),
  debugMode: getEl<HTMLInputElement>('debugMode'),
  lastCollectInfo: getEl<HTMLElement>('lastCollectInfo'),
  saveBtn: getEl<HTMLButtonElement>('saveBtn'),
  saveStatus: getEl<HTMLElement>('saveStatus'),
};

// Platform elements - dynamically accessed via PLATFORMS config
const platformElements = {
  getToggle: (platform: PlatformKey) => getEl<HTMLInputElement>(PLATFORMS[platform].toggle),
  getConfig: (platform: PlatformKey) => getEl<HTMLElement>(PLATFORMS[platform].config),
  // Updated to get the multi-input container
  getMultiInputContainer: (platform: PlatformKey) =>
    document.querySelector(`.multi-input-group[data-platform="${platform}"]`) as HTMLElement,
};

/**
 * Update platform config visibility based on toggle state
 */
function updatePlatformVisibility(platform: PlatformKey) {
  const toggleEl = platformElements.getToggle(platform);
  const configEl = platformElements.getConfig(platform);

  if (toggleEl && configEl) {
    configEl.classList.toggle('hidden', !toggleEl.checked);
  }
}

/**
 * Get enabled sources from toggle states
 */
function getEnabledSources(): string[] {
  return ALL_PLATFORMS.filter((platform) => platformElements.getToggle(platform)?.checked);
}

/**
 * Render multi-input list for a platform
 */
function renderMultiInput(container: HTMLElement, values: string[]) {
  if (!container) return;

  const list = container.querySelector('.input-list') as HTMLElement;
  const addBtn = container.querySelector('.add-btn') as HTMLButtonElement;

  if (!list || !addBtn) return;

  list.innerHTML = ''; // Clear existing

  const createRow = (value: string = '') => {
    const row = document.createElement('div');
    row.className = 'input-row-dynamic';
    row.style.display = 'flex';
    row.style.marginBottom = '8px';
    row.style.gap = '8px';
    row.style.alignItems = 'center';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.flex = '1';
    input.className = 'dynamic-input';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '❌';
    removeBtn.className = 'remove-btn';
    removeBtn.type = 'button';
    removeBtn.style.background = 'none';
    removeBtn.style.border = 'none';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.padding = '0 5px';
    removeBtn.title = 'Remove';

    removeBtn.onclick = () => {
      row.remove();
    };

    row.appendChild(input);
    row.appendChild(removeBtn);
    return row;
  };

  const addInput = (val: string = '') => {
    const row = createRow(val);
    list.appendChild(row);
  };

  // Populate existing values
  if (Array.isArray(values) && values.length > 0) {
    values.forEach((val) => addInput(val));
  } else {
    // Add one empty input by default if no values
    addInput();
  }

  // Handle Add button
  // Clone to remove old listeners
  const newBtn = addBtn.cloneNode(true) as HTMLButtonElement;
  addBtn.parentNode?.replaceChild(newBtn, addBtn);
  newBtn.addEventListener('click', () => addInput());
}

/**
 * Get values from multi-input container
 */
function getMultiInputValues(container: HTMLElement): string[] {
  if (!container) return [];
  const inputs = container.querySelectorAll('.dynamic-input') as NodeListOf<HTMLInputElement>;
  return Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((val) => val.length > 0);
}

/**
 * Load saved configuration
 */
async function loadConfig() {
  const config = await getConfig();

  // Load core settings
  coreElements.notionToken.value = config.notionToken || '';
  coreElements.notionDatabaseId.value = config.notionDatabaseId || '';
  coreElements.notionDataSourceId.value = config.notionDataSourceId || '';
  coreElements.githubToken.value = config.githubToken || '';
  coreElements.githubOwner.value = config.githubOwner || '';
  coreElements.githubRepo.value = config.githubRepo || '';
  coreElements.collectIntervalHours.value = (config.collectIntervalHours ?? 4).toString();
  coreElements.debugMode.checked = config.debugMode || false;

  // Load platform-specific settings
  const enabledSources = config.enabledSources || DEFAULT_ENABLED_SOURCES;
  for (const platform of ALL_PLATFORMS) {
    // Set toggle state
    platformElements.getToggle(platform).checked = enabledSources.includes(platform);

    // Load target user/group values
    const configKey = PLATFORMS[platform].configKey;
    const container = platformElements.getMultiInputContainer(platform);

    // Config value should be array now due to migration logic in storage.ts
    // But for safety, handle string case just in case
    let values: string[] = [];
    const rawValue = config[configKey];
    if (Array.isArray(rawValue)) {
      values = rawValue as string[];
    } else if (typeof rawValue === 'string' && rawValue) {
      values = [rawValue];
    }

    renderMultiInput(container, values);

    // Update visibility
    updatePlatformVisibility(platform);
  }

  // Display last collect time
  if (config.lastCollectTime) {
    const date = new Date(config.lastCollectTime);
    coreElements.lastCollectInfo.textContent = `Last collected: ${date.toLocaleString()}`;
  } else {
    coreElements.lastCollectInfo.textContent = 'Last collected: Never';
  }
}

/**
 * Save configuration
 */
async function handleSave() {
  const currentConfig = await getConfig();

  // Build config object with core settings
  const config: any = {
    ...currentConfig,
    notionToken: coreElements.notionToken.value.trim(),
    notionDatabaseId: coreElements.notionDatabaseId.value.trim(),
    notionDataSourceId: coreElements.notionDataSourceId.value.trim(),
    githubToken: coreElements.githubToken.value.trim(),
    githubOwner: coreElements.githubOwner.value.trim(),
    githubRepo: coreElements.githubRepo.value.trim(),
    collectIntervalHours:
      coreElements.collectIntervalHours.value === ''
        ? 4
        : parseInt(coreElements.collectIntervalHours.value, 10),
    debugMode: coreElements.debugMode.checked,
    enabledSources: getEnabledSources(),
  };

  // Dynamically add platform-specific settings
  for (const platform of ALL_PLATFORMS) {
    const configKey = PLATFORMS[platform].configKey;
    const container = platformElements.getMultiInputContainer(platform);

    let values = getMultiInputValues(container);

    // Special case: X removes @ prefix
    if (platform === 'x') {
      values = values.map((v) => v.replace('@', ''));
    }

    config[configKey] = values;
  }

  try {
    await saveConfig(config);
    coreElements.saveStatus.textContent = '✅ Saved!';
    coreElements.saveStatus.className = 'save-status success';

    setTimeout(() => {
      coreElements.saveStatus.textContent = '';
    }, 2000);
  } catch (error) {
    coreElements.saveStatus.textContent = '❌ Error saving';
    coreElements.saveStatus.className = 'save-status error';
  }
}

// Event listeners
coreElements.saveBtn.addEventListener('click', handleSave);

// Platform toggle listeners - dynamically set up for all platforms
for (const platform of ALL_PLATFORMS) {
  platformElements
    .getToggle(platform)
    .addEventListener('change', () => updatePlatformVisibility(platform));
}

// Initialize
document.addEventListener('DOMContentLoaded', loadConfig);
