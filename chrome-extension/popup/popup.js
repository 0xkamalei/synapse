/**
 * Synapse Popup Script
 */

import { getConfig, validateConfig } from '../lib/storage.js';

// DOM Elements
const elements = {
    configStatus: document.getElementById('configStatus'),
    lastSync: document.getElementById('lastSync'),
    collectNow: document.getElementById('collectNow'),
    viewLogs: document.getElementById('viewLogs'),
    openOptions: document.getElementById('openOptions')
};

/**
 * Initialize popup
 */
async function init() {
    await checkConfigStatus();
    await updateLastSync();
    setupEventListeners();
}

/**
 * Check and display configuration status
 */
async function checkConfigStatus() {
    const status = await validateConfig();
    const dot = elements.configStatus.querySelector('.status-dot');
    const text = elements.configStatus.querySelector('.status-text');

    if (status.valid) {
        dot.style.background = '#198754'; // green
        text.textContent = 'Ready';
    } else {
        dot.style.background = '#B3261E'; // red
        text.textContent = 'Config needed';
    }
}

/**
 * Update last collect time display
 */
async function updateLastSync() {
    const config = await getConfig();
    const text = elements.lastSync;

    if (config.lastCollectTime) {
        const date = new Date(config.lastCollectTime);
        text.textContent = `Last sync: ${date.toLocaleString()}`;
    } else {
        text.textContent = 'Last sync: Never';
    }
}

/**
 * Handle manual collection
 */
async function handleManualCollect() {
    const btn = elements.collectNow;
    const btnText = btn.querySelector('.btn-text');
    const originalText = btnText.textContent;

    try {
        btn.disabled = true;
        btnText.textContent = 'Collecting...';

        // Query active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) throw new Error('No active tab found');

        // Check if we are on a supported page
        const isBilibili = tab.url.includes('bilibili.com');
        const isX = tab.url.includes('x.com') || tab.url.includes('twitter.com');

        if (!isBilibili && !isX) {
            throw new Error('Please open Bilibili or X.com');
        }

        // Send collect message to content script (bypassing interval)
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_COLLECT' });

        if (response && response.success) {
            btnText.textContent = 'Success!';
            btn.style.background = '#198754';
            await updateLastSync();
        } else {
            throw new Error(response?.error || 'Collection failed');
        }

    } catch (error) {
        console.error('Manual collect error:', error);
        btnText.textContent = 'Error!';
        btn.style.background = '#B3261E';
        alert(error.message);
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btnText.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    elements.collectNow.addEventListener('click', handleManualCollect);

    elements.viewLogs.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('logs/logs.html') });
    });

    elements.openOptions.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
