/**
 * Synapse Activity Logs Page
 */

import { getLogs, clearLogs } from '../lib/logger.js';

const elements = {
  logsList: document.getElementById('logsList') as HTMLElement,
  clearLogs: document.getElementById('clearLogs') as HTMLButtonElement,
  closePage: document.getElementById('closePage') as HTMLButtonElement,
  logSearch: document.getElementById('logSearch') as HTMLInputElement,
  levelFilter: document.getElementById('levelFilter') as HTMLSelectElement,
  sourceFilter: document.getElementById('sourceFilter') as HTMLSelectElement,
};

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
  await renderLogs();
  setupEventListeners();
});

function setupEventListeners() {
  elements.clearLogs.addEventListener('click', async () => {
    await clearLogs();
    await renderLogs();
  });

  elements.closePage.addEventListener('click', () => {
    window.close(); // Close current tab/window
  });

  elements.logSearch.addEventListener('input', () => renderLogs());
  elements.levelFilter.addEventListener('change', () => renderLogs());
  elements.sourceFilter.addEventListener('change', () => renderLogs());

  // Listen for storage changes to update logs in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.logs) {
      renderLogs();
    }
  });
}

async function renderLogs() {
  const logs: LogEntry[] = await getLogs();
  const searchTerm = elements.logSearch.value.toLowerCase();
  const levelFilter = elements.levelFilter.value;
  const sourceFilter = elements.sourceFilter.value;

  // Filter logs first
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchTerm) ||
      log.summary.toLowerCase().includes(searchTerm);
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;

    const source =
      log.data?.source ||
      (log.message.includes('Bilibili')
        ? 'Bilibili'
        : log.message.includes('X')
          ? 'X'
          : log.message.includes('QZone')
            ? 'QZone'
            : '');
    const matchesSource = sourceFilter === 'all' || source === sourceFilter;

    return matchesSearch && matchesLevel && matchesSource;
  });

  if (filteredLogs.length === 0) {
    elements.logsList.innerHTML = '<div class="empty-state">No logs found matching filters.</div>';
    return;
  }

  elements.logsList.innerHTML = filteredLogs
    .map((log) => {
      const date = new Date(log.timestamp);
      const timeStr = date.toLocaleString();
      const source =
        log.data?.source ||
        (log.message.includes('Bilibili')
          ? 'Bilibili'
          : log.message.includes('X')
            ? 'X'
            : log.message.includes('QZone')
              ? 'QZone'
              : '');
      const title = log.summary || log.message;

      return `
            <div class="log-entry ${log.level}" id="${log.id}">
                <div class="log-header">
                    <span class="log-level">${log.level}</span>
                    <span class="log-time">${timeStr}</span>
                    <span class="log-source">📍 ${source}</span>
                </div>
                <div class="log-title">${title}</div>
                ${log.summary ? `<div class="log-message">${log.message}</div>` : ''}
                <div class="log-meta">
                    <span class="meta-item action-json" data-id="${log.id}">📄 View JSON</span>
                    ${
                      log.data?.notionPageId
                        ? `
                        <span class="meta-item">🔗 <a href="https://notion.so/${log.data.notionPageId.replace(/-/g, '')}" target="_blank">Notion Page</a></span>
                    `
                        : ''
                    }
                    ${
                      log.data?.url
                        ? `
                        <span class="meta-item">🌐 <a href="${log.data.url}" target="_blank">Original Link</a></span>
                    `
                        : ''
                    }
                </div>
                <div class="log-json" id="json-${log.id}" style="display: none;">
                    <pre><code>${JSON.stringify(log.data || {}, null, 2)}</code></pre>
                </div>
            </div>
        `;
    })
    .join('');

  setupLogItemListeners();
}

function setupLogItemListeners() {
  document.querySelectorAll('.action-json').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).getAttribute('data-id');
      const jsonDiv = document.getElementById(`json-${id}`);
      if (jsonDiv) {
        if (jsonDiv.style.display === 'none') {
          jsonDiv.style.display = 'block';
          (e.target as HTMLElement).textContent = '📄 Hide JSON';
        } else {
          jsonDiv.style.display = 'none';
          (e.target as HTMLElement).textContent = '📄 View JSON';
        }
      }
    });
  });
}
