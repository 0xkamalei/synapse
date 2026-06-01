/**
 * Synapse Popup Script
 */

import { getConfig, validateConfig } from '../lib/storage.js';

// DOM Elements
const elements = {
  configStatus: document.getElementById('configStatus') as HTMLElement,
  lastSync: document.getElementById('lastSync') as HTMLElement,
  collectNow: document.getElementById('collectNow') as HTMLButtonElement,
  openOptions: document.getElementById('openOptions') as HTMLElement,
  recentList: document.getElementById('recentList') as HTMLElement,
};

async function init() {
  await checkConfigStatus();
  await updateLastSync();
  await loadRecentCollections();
  setupEventListeners();
  await checkPageStatus();
}

async function checkConfigStatus() {
  const status = await validateConfig();
  const dot = elements.configStatus.querySelector('.status-dot') as HTMLElement;
  const text = elements.configStatus.querySelector('.status-text') as HTMLElement;

  if (status.valid) {
    dot.style.background = '#198754';
    text.textContent = 'Ready';
  } else {
    dot.style.background = '#B3261E';
    text.textContent = 'Config needed';
  }
}

async function updateLastSync() {
  const config = await getConfig();
  const textElement = elements.lastSync.querySelector('.status-text');
  if (!textElement) return;

  if (config.lastCollectTime) {
    const date = new Date(config.lastCollectTime);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    textElement.textContent = `Last: ${timeStr}`;
    elements.lastSync.title = `Last sync: ${date.toLocaleString()}`;
  } else {
    textElement.textContent = 'Last: Never';
  }
}

async function loadRecentCollections() {
  const { recentCollections = [] } = await chrome.storage.local.get('recentCollections');
  renderRecentCollections(recentCollections as LogEntry[]);
}

function renderRecentCollections(entries: LogEntry[]) {
  const list = elements.recentList;

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-state">No collections yet</div>';
    return;
  }

  list.innerHTML = entries
    .slice(0, 5)
    .map((entry) => {
      const time = formatRelativeTime(entry.timestamp);
      const source = entry.data?.source ?? '?';
      const isSuccess = entry.level === 'success';
      const detail = entry.summary || entry.message;

      return `
      <div class="recent-entry ${entry.level}">
        <span class="recent-source">${source}</span>
        <span class="recent-msg">${escapeHtml(detail)}</span>
        <span class="recent-time">${time}</span>
      </div>`;
    })
    .join('');
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function checkPageStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) {
      elements.collectNow.style.display = 'none';
      return;
    }

    let isMatched = false;

    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      if (!frames) {
        elements.collectNow.style.display = 'none';
        return;
      }

      for (const frame of frames) {
        try {
          const response = await chrome.tabs.sendMessage(
            tab.id,
            { type: 'GET_PAGE_INFO' },
            { frameId: frame.frameId },
          );
          if (response && response.isTargetPage === true) {
            isMatched = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.error('Error communicating with content scripts:', e);
    }

    elements.collectNow.style.display = isMatched ? 'flex' : 'none';
  } catch (e) {
    console.error('Error checking page status:', e);
    elements.collectNow.style.display = 'none';
  }
}

async function handleManualCollect() {
  const btn = elements.collectNow;
  const btnText = btn.querySelector('.btn-text') as HTMLElement;
  const originalText = btnText.textContent;

  try {
    btn.disabled = true;
    btnText.textContent = 'Collecting...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found');

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
          break;
        } else if (response && response.error) {
          lastError = response.error;
        }
      } catch (e) {
        // ignore frames without listeners
      }
    }

    if (success) {
      btnText.textContent = 'Success!';
      btn.style.background = '#198754';
      await updateLastSync();
      // Refresh recent collections after a brief delay for the log to propagate
      setTimeout(() => loadRecentCollections(), 500);
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

function setupEventListeners() {
  elements.collectNow.addEventListener('click', handleManualCollect);

  elements.openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Live-update recent list when storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.recentCollections) {
      renderRecentCollections((changes.recentCollections.newValue as LogEntry[]) ?? []);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
