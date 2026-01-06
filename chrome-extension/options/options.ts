/**
 * Synapse Options Page
 * Configuration UI for the extension
 */

import { getConfig, saveConfig } from '../lib/storage.js';

// DOM Elements
const elements = {
    notionToken: document.getElementById('notionToken') as HTMLInputElement,
    notionDatabaseId: document.getElementById('notionDatabaseId') as HTMLInputElement,
    notionDataSourceId: document.getElementById('notionDataSourceId') as HTMLInputElement,
    githubToken: document.getElementById('githubToken') as HTMLInputElement,
    githubOwner: document.getElementById('githubOwner') as HTMLInputElement,
    githubRepo: document.getElementById('githubRepo') as HTMLInputElement,
    targetXUser: document.getElementById('targetXUser') as HTMLInputElement,
    targetBilibiliUser: document.getElementById('targetBilibiliUser') as HTMLInputElement,
    targetQZoneUser: document.getElementById('targetQZoneUser') as HTMLInputElement,
    collectIntervalHours: document.getElementById('collectIntervalHours') as HTMLInputElement,
    debugMode: document.getElementById('debugMode') as HTMLInputElement,
    lastCollectInfo: document.getElementById('lastCollectInfo') as HTMLElement,
    saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
    saveStatus: document.getElementById('saveStatus') as HTMLElement
};

/**
 * Load saved configuration
 */
async function loadConfig() {
    const config = await getConfig();

    elements.notionToken.value = config.notionToken || '';
    elements.notionDatabaseId.value = config.notionDatabaseId || '';
    elements.notionDataSourceId.value = config.notionDataSourceId || '';
    elements.githubToken.value = config.githubToken || '';
    elements.githubOwner.value = config.githubOwner || '';
    elements.githubRepo.value = config.githubRepo || '';
    elements.targetXUser.value = config.targetXUser || '';
    elements.targetBilibiliUser.value = config.targetBilibiliUser || '';
    elements.targetQZoneUser.value = config.targetQZoneUser || '';
    elements.collectIntervalHours.value = (config.collectIntervalHours ?? 4).toString();
    elements.debugMode.checked = config.debugMode || false;

    // Display last collect time
    if (config.lastCollectTime) {
        const date = new Date(config.lastCollectTime);
        elements.lastCollectInfo.textContent = `Last collected: ${date.toLocaleString()}`;
    } else {
        elements.lastCollectInfo.textContent = 'Last collected: Never';
    }
}

/**
 * Save configuration
 */
async function handleSave() {
    const currentConfig = await getConfig();
    const config: AppConfig = {
        ...currentConfig,
        notionToken: elements.notionToken.value.trim(),
        notionDatabaseId: elements.notionDatabaseId.value.trim(),
        notionDataSourceId: elements.notionDataSourceId.value.trim(),
        githubToken: elements.githubToken.value.trim(),
        githubOwner: elements.githubOwner.value.trim(),
        githubRepo: elements.githubRepo.value.trim(),
        targetXUser: elements.targetXUser.value.trim().replace('@', ''),
        targetBilibiliUser: elements.targetBilibiliUser.value.trim(),
        targetQZoneUser: elements.targetQZoneUser.value.trim(),
        collectIntervalHours: elements.collectIntervalHours.value === '' ? 4 : parseInt(elements.collectIntervalHours.value, 10),
        debugMode: elements.debugMode.checked,
        enabledSources: ['x', 'bilibili', 'qzone']
    };

    try {
        await saveConfig(config);
        elements.saveStatus.textContent = '✅ Saved!';
        elements.saveStatus.className = 'save-status success';

        setTimeout(() => {
            elements.saveStatus.textContent = '';
        }, 2000);
    } catch (error) {
        elements.saveStatus.textContent = '❌ Error saving';
        elements.saveStatus.className = 'save-status error';
    }
}

// Event listeners
elements.saveBtn.addEventListener('click', handleSave);

// Initialize
document.addEventListener('DOMContentLoaded', loadConfig);
