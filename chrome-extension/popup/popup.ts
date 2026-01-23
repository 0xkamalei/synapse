/**
 * Synapse Popup Script
 */

import { getConfig, validateConfig } from '../lib/storage.js';

// DOM Elements
const elements = {
  configStatus: document.getElementById('configStatus') as HTMLElement,
  lastSync: document.getElementById('lastSync') as HTMLElement,
  collectNow: document.getElementById('collectNow') as HTMLButtonElement,
  viewLogs: document.getElementById('viewLogs') as HTMLElement,
  openOptions: document.getElementById('openOptions') as HTMLElement,
};

/**
 * Initialize popup
 */
async function init() {
  await checkConfigStatus();
  await updateLastSync();
  setupEventListeners();
  await checkPageStatus();
}

/**
 * Check and display configuration status
 */
async function checkConfigStatus() {
  const status = await validateConfig();
  const dot = elements.configStatus.querySelector('.status-dot') as HTMLElement;
  const text = elements.configStatus.querySelector('.status-text') as HTMLElement;

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
  const container = elements.lastSync;
  const textElement = container.querySelector('.status-text');
  if (!textElement) return;

  if (config.lastCollectTime) {
    const date = new Date(config.lastCollectTime);
    // Use a shorter format for the status bar
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    textElement.textContent = `Last: ${timeStr}`;
    container.title = `Last sync: ${date.toLocaleString()}`;
  } else {
    textElement.textContent = 'Last: Never';
  }
}

/**
 * Check if current page has collectable content
 * Uses unified message communication with content scripts
 */
async function checkPageStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) {
      elements.collectNow.style.display = 'none';
      return;
    }

    // Try to get page info from content script
    let isMatched = false;

    try {
      // Get all frames in the tab
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      if (!frames) {
        elements.collectNow.style.display = 'none';
        return;
      }

      // Try each frame to find a content script that responds
      for (const frame of frames) {
        try {
          const response = await chrome.tabs.sendMessage(
            tab.id,
            { type: 'GET_PAGE_INFO' },
            { frameId: frame.frameId },
          );

          // Check if any collector reports isTargetPage = true
          // All collectors now use the unified PageInfo interface
          if (response && response.isTargetPage === true) {
            isMatched = true;
            break;
          }
        } catch (e) {
          // This frame doesn't have a content script, continue
          continue;
        }
      }
    } catch (e) {
      console.error('Error communicating with content scripts:', e);
    }

    if (isMatched) {
      elements.collectNow.style.display = 'flex';
    } else {
      elements.collectNow.style.display = 'none';
    }
  } catch (e) {
    console.error('Error checking page status:', e);
    elements.collectNow.style.display = 'none';
  }
}

/**
 * Handle manual collection
 */
async function handleManualCollect() {
  const btn = elements.collectNow;
  const btnText = btn.querySelector('.btn-text') as HTMLElement;
  const originalText = btnText.textContent;

  try {
    btn.disabled = true;
    btnText.textContent = 'Collecting...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found');

    // Broadcast to all frames
    if (!chrome.webNavigation) {
      throw new Error('webNavigation API not available. Please check extension permissions.');
    }
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id! });

    if (!frames) throw new Error('Could not get frames');

    let success = false;
    let lastError = 'No content found to collect';

    for (const frame of frames) {
      try {
        const response = await chrome.tabs.sendMessage(
          tab.id!,
          { type: 'POP_TO_CONTENT_COLLECT' },
          { frameId: frame.frameId },
        );
        if (response && response.success) {
          success = true;
          // Don't break if it's a batch collection, but for now QZone/Bili/X are usually one-shot per frame
          break;
        } else if (response && response.error) {
          lastError = response.error;
        }
      } catch (e) {
        // Ignore frames without listeners
      }
    }

    if (success) {
      btnText.textContent = 'Success!';
      btn.style.background = '#198754';
      await updateLastSync();
    } else {
      throw new Error(lastError);
    }
  } catch (error: any) {
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
