/**
 * Synapse Options Page
 * Configuration UI for the extension
 */

import { getConfig, saveConfig } from '../lib/storage.js';

// DOM Elements
const elements = {
    notionToken: document.getElementById('notionToken'),
    notionDatabaseId: document.getElementById('notionDatabaseId'),
    githubToken: document.getElementById('githubToken'),
    githubOwner: document.getElementById('githubOwner'),
    githubRepo: document.getElementById('githubRepo'),
    targetXUser: document.getElementById('targetXUser'),
    targetBilibiliUser: document.getElementById('targetBilibiliUser'),
    collectIntervalHours: document.getElementById('collectIntervalHours'),
    debugMode: document.getElementById('debugMode'),
    lastCollectInfo: document.getElementById('lastCollectInfo'),
    saveBtn: document.getElementById('saveBtn'),
    saveStatus: document.getElementById('saveStatus')
};

/**
 * Load saved configuration
 */
async function loadConfig() {
    const config = await getConfig();

    elements.notionToken.value = config.notionToken || '';
    elements.notionDatabaseId.value = config.notionDatabaseId || '';
    elements.githubToken.value = config.githubToken || '';
    elements.githubOwner.value = config.githubOwner || '';
    elements.githubRepo.value = config.githubRepo || '';
    elements.targetXUser.value = config.targetXUser || '';
    elements.targetBilibiliUser.value = config.targetBilibiliUser || '';
    elements.collectIntervalHours.value = config.collectIntervalHours ?? 4;
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
    const config = {
        notionToken: elements.notionToken.value.trim(),
        notionDatabaseId: elements.notionDatabaseId.value.trim(),
        githubToken: elements.githubToken.value.trim(),
        githubOwner: elements.githubOwner.value.trim(),
        githubRepo: elements.githubRepo.value.trim(),
        targetXUser: elements.targetXUser.value.trim().replace('@', ''),
        targetBilibiliUser: elements.targetBilibiliUser.value.trim(),
        collectIntervalHours: elements.collectIntervalHours.value === '' ? 4 : parseInt(elements.collectIntervalHours.value, 10),
        debugMode: elements.debugMode.checked,
        enabledSources: ['x', 'bilibili']
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
