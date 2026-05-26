/**
 * Synapse Options Page
 * Configuration UI for the extension
 */

import { getConfig, saveConfig } from '../lib/storage.js';
import { getScheduledTasks, saveScheduledTasks, URLTask } from '../lib/local-server-client.js';
import {
  PLATFORMS,
  PlatformKey,
  DEFAULT_ENABLED_SOURCES,
  ALL_PLATFORMS,
  buildPlatformUrl,
} from '../lib/platforms.js';

// Helper function to get element by id with type assertion
function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// DOM Elements - Core settings
const coreElements = {
  localServerUrl: getEl<HTMLInputElement>('localServerUrl'),
  localServerToken: getEl<HTMLInputElement>('localServerToken'),
  collectIntervalMinutes: getEl<HTMLInputElement>('collectIntervalMinutes'),
  debugMode: getEl<HTMLInputElement>('debugMode'),
  lastCollectInfo: getEl<HTMLElement>('lastCollectInfo'),
  saveBtn: getEl<HTMLButtonElement>('saveBtn'),
  saveStatus: getEl<HTMLElement>('saveStatus'),
  testServerBtn: getEl<HTMLButtonElement>('testServerBtn'),
  testServerStatus: getEl<HTMLElement>('testServerStatus'),
};

/**
 * Schedule state: full task list kept in memory, rebuilt on save.
 */
let scheduledTasks: URLTask[] = [];

// Platform elements - dynamically accessed via PLATFORMS config
const platformElements = {
  getToggle: (platform: PlatformKey) => getEl<HTMLInputElement>(PLATFORMS[platform].toggle),
  getConfig: (platform: PlatformKey) => getEl<HTMLElement>(PLATFORMS[platform].config),
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
 * Build a stable task ID for a platform+account combination.
 */
function buildTaskId(platform: PlatformKey, accountId: string): string {
  return `sched_${platform}_${accountId}`;
}

/**
 * Create one account row: [text input] [schedule toggle] [time picker] [remove btn]
 * Schedule state is read from / written to the scheduledTasks array.
 */
function createAccountRow(platform: PlatformKey, value: string, onRemove: () => void): HTMLElement {
  const taskId = buildTaskId(platform, value);
  const url = buildPlatformUrl(platform, value) || '';

  // Ensure a task entry exists for this account
  let task = scheduledTasks.find((t) => t.id === taskId);
  if (!task) {
    task = { id: taskId, url, enabled: false, time: '09:00' };
    scheduledTasks.push(task);
  } else {
    task.url = url;
  }

  const row = document.createElement('div');
  row.className = 'account-row';

  // ── Text input ──────────────────────────────────
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.className = 'dynamic-input';
  input.placeholder = 'Account ID';

  // When the account ID changes, update the task id/url in scheduledTasks
  input.addEventListener('input', () => {
    const newId = input.value.trim();
    const newTaskId = buildTaskId(platform, newId);
    const newUrl = buildPlatformUrl(platform, newId) || '';

    // Remove old task entry and replace with new one
    const idx = scheduledTasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      scheduledTasks[idx] = {
        ...scheduledTasks[idx],
        id: newTaskId,
        url: newUrl,
      };
    }
    // Update the row's data attribute so remove still works
    row.dataset.taskId = newTaskId;
    timeInput.disabled = !schedToggleInput.checked;
  });

  row.dataset.taskId = taskId;

  // ── Schedule toggle (small) ─────────────────────
  const schedToggleLabel = document.createElement('label');
  schedToggleLabel.className = 'toggle-sm';
  schedToggleLabel.title = 'Enable scheduled collection';

  const schedToggleInput = document.createElement('input');
  schedToggleInput.type = 'checkbox';
  schedToggleInput.checked = task.enabled;

  const schedToggleSlider = document.createElement('span');
  schedToggleSlider.className = 'toggle-slider';

  schedToggleLabel.appendChild(schedToggleInput);
  schedToggleLabel.appendChild(schedToggleSlider);

  // ── Time picker ─────────────────────────────────
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = task.time;
  timeInput.disabled = !task.enabled;
  timeInput.title = 'Collection time';

  schedToggleInput.addEventListener('change', () => {
    timeInput.disabled = !schedToggleInput.checked;
    const currentTaskId = row.dataset.taskId!;
    const t = scheduledTasks.find((t) => t.id === currentTaskId);
    if (t) t.enabled = schedToggleInput.checked;
  });

  timeInput.addEventListener('input', () => {
    const currentTaskId = row.dataset.taskId!;
    const t = scheduledTasks.find((t) => t.id === currentTaskId);
    if (t) t.time = timeInput.value;
  });

  // ── Remove button ────────────────────────────────
  const removeBtn = document.createElement('button');
  removeBtn.textContent = '❌';
  removeBtn.className = 'remove-btn';
  removeBtn.type = 'button';
  removeBtn.title = 'Remove';
  removeBtn.onclick = () => {
    // Clean up task entry
    const currentTaskId = row.dataset.taskId!;
    scheduledTasks = scheduledTasks.filter((t) => t.id !== currentTaskId);
    onRemove();
  };

  row.appendChild(input);
  row.appendChild(schedToggleLabel);
  row.appendChild(timeInput);
  row.appendChild(removeBtn);
  return row;
}

/**
 * Render multi-input list for a platform.
 * Each row contains: account input + inline schedule toggle + time picker + remove.
 */
function renderMultiInput(container: HTMLElement, values: string[], platform: PlatformKey) {
  if (!container) return;

  const list = container.querySelector('.input-list') as HTMLElement;
  const addBtn = container.querySelector('.add-btn') as HTMLButtonElement;
  if (!list || !addBtn) return;

  list.innerHTML = '';

  const addRow = (val: string = '') => {
    const row = createAccountRow(platform, val, () => row.remove());
    list.appendChild(row);
  };

  if (Array.isArray(values) && values.length > 0) {
    values.forEach((val) => addRow(val));
  } else {
    addRow();
  }

  // Clone button to remove stale listeners
  const newBtn = addBtn.cloneNode(true) as HTMLButtonElement;
  addBtn.parentNode?.replaceChild(newBtn, addBtn);
  newBtn.addEventListener('click', () => addRow());
}

/**
 * Get account values from multi-input container
 */
function getMultiInputValues(container: HTMLElement): string[] {
  if (!container) return [];
  const inputs = container.querySelectorAll('.dynamic-input') as NodeListOf<HTMLInputElement>;
  return Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((val) => val.length > 0);
}

/**
 * Reconcile scheduledTasks: remove all tasks that don't match current platform accounts.
 * tasks.json must be a 1:1 mirror of the extension config — no orphan tasks allowed.
 */
function reconcileScheduledTasks() {
  const validIds = new Set<string>();
  for (const platform of ALL_PLATFORMS) {
    const container = platformElements.getMultiInputContainer(platform);
    getMultiInputValues(container).forEach((accountId) => {
      validIds.add(buildTaskId(platform, accountId));
    });
  }
  scheduledTasks = scheduledTasks.filter((t) => validIds.has(t.id));
}

/**
 * Load saved configuration
 */
async function loadConfig() {
  const config = await getConfig();

  coreElements.localServerUrl.value = config.localServerUrl || 'http://127.0.0.1:7070';
  coreElements.localServerToken.value = config.localServerToken || '';
  coreElements.collectIntervalMinutes.value = (config.collectIntervalMinutes ?? 240).toString();
  coreElements.debugMode.checked = config.debugMode || false;

  // Load tasks first so createAccountRow can find existing state
  scheduledTasks = await getScheduledTasks();

  const enabledSources = config.enabledSources || DEFAULT_ENABLED_SOURCES;
  for (const platform of ALL_PLATFORMS) {
    platformElements.getToggle(platform).checked = enabledSources.includes(platform);

    const configKey = PLATFORMS[platform].configKey;
    const container = platformElements.getMultiInputContainer(platform);

    let values: string[] = [];
    const rawValue = config[configKey];
    if (Array.isArray(rawValue)) {
      values = rawValue as string[];
    } else if (typeof rawValue === 'string' && rawValue) {
      values = [rawValue];
    }

    renderMultiInput(container, values, platform);
    updatePlatformVisibility(platform);
  }

  if (config.lastCollectTime) {
    coreElements.lastCollectInfo.textContent = `Last collected: ${new Date(config.lastCollectTime).toLocaleString()}`;
  } else {
    coreElements.lastCollectInfo.textContent = 'Last collected: Never';
  }
}

/**
 * Save configuration
 */
async function handleSave() {
  const currentConfig = await getConfig();

  const config: any = {
    ...currentConfig,
    localServerUrl: coreElements.localServerUrl.value.trim(),
    localServerToken: coreElements.localServerToken.value.trim(),
    collectIntervalMinutes:
      coreElements.collectIntervalMinutes.value === ''
        ? 240
        : parseInt(coreElements.collectIntervalMinutes.value, 10),
    debugMode: coreElements.debugMode.checked,
    enabledSources: getEnabledSources(),
  };

  for (const platform of ALL_PLATFORMS) {
    const configKey = PLATFORMS[platform].configKey;
    const container = platformElements.getMultiInputContainer(platform);
    let values = getMultiInputValues(container);
    if (platform === 'x') {
      values = values.map((v) => v.replace('@', ''));
    }
    config[configKey] = values;
  }

  // Prune stale tasks and sync URLs
  reconcileScheduledTasks();
  for (const platform of ALL_PLATFORMS) {
    const container = platformElements.getMultiInputContainer(platform);
    getMultiInputValues(container).forEach((accountId) => {
      const taskId = buildTaskId(platform, accountId);
      const task = scheduledTasks.find((t) => t.id === taskId);
      if (task) task.url = buildPlatformUrl(platform, accountId) || task.url;
    });
  }

  try {
    await saveConfig(config);
    await saveScheduledTasks(scheduledTasks);

    coreElements.saveStatus.textContent = '✅ Saved!';
    coreElements.saveStatus.className = 'save-status success';
    setTimeout(() => { coreElements.saveStatus.textContent = ''; }, 2000);
  } catch {
    coreElements.saveStatus.textContent = '❌ Error saving';
    coreElements.saveStatus.className = 'save-status error';
  }
}

/**
 * Test connection to the local server
 */
async function handleTestServer() {
  const url = coreElements.localServerUrl.value.trim();
  const token = coreElements.localServerToken.value.trim();
  const btn = coreElements.testServerBtn;
  const status = coreElements.testServerStatus;

  if (!url) {
    status.textContent = '⚠️ Please enter a Server URL first';
    status.className = 'test-status error';
    return;
  }

  btn.disabled = true;
  status.textContent = '⏳ Testing...';
  status.className = 'test-status loading';

  try {
    const baseUrl = url.replace(/\/+$/, '');
    const healthResp = await fetch(`${baseUrl}/health`, { method: 'GET' });

    if (!healthResp.ok) {
      const body = await healthResp.json().catch(() => null);
      status.textContent = `❌ Server error (${healthResp.status}): ${body?.error || healthResp.statusText}`;
      status.className = 'test-status error';
      btn.disabled = false;
      return;
    }

    const healthData = await healthResp.json();

    if (token) {
      const statsResp = await fetch(`${baseUrl}/stats`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statsResp.ok) {
        const statsData = await statsResp.json();
        status.textContent = `✅ Connected (${statsData.total || 0} items, v${healthData.version || '?'})`;
        status.className = 'test-status success';
      } else if (statsResp.status === 401 || statsResp.status === 403) {
        status.textContent = '⚠️ Server reachable but token rejected (401)';
        status.className = 'test-status error';
      } else {
        status.textContent = `⚠️ Server reachable, stats error (${statsResp.status})`;
        status.className = 'test-status error';
      }
    } else {
      status.textContent = `✅ Server reachable (v${healthData.version || '?'}) — no token configured`;
      status.className = 'test-status success';
    }
  } catch (err: any) {
    status.textContent = `❌ Cannot reach server: ${err.message || 'network error'}`;
    status.className = 'test-status error';
  }

  btn.disabled = false;
}

// ── Tab switching ──────────────────────────────────────────────────────────

function initTabs() {
  const tabItems = document.querySelectorAll<HTMLElement>('.tab-item');
  const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');

  tabItems.forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset.tab;
      if (!target) return;
      tabItems.forEach((t) => t.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });
}

// Event listeners
coreElements.saveBtn.addEventListener('click', handleSave);
coreElements.testServerBtn.addEventListener('click', handleTestServer);

for (const platform of ALL_PLATFORMS) {
  platformElements
    .getToggle(platform)
    .addEventListener('change', () => updatePlatformVisibility(platform));
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadConfig();
});
