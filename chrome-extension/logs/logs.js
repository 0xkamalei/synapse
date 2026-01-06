/**
 * Synapse Activity Logs Page
 */

import { getLogs, clearLogs } from '../lib/logger.js';

const elements = {
    logsList: document.getElementById('logsList'),
    clearLogs: document.getElementById('clearLogs'),
    closePage: document.getElementById('closePage'),
    logSearch: document.getElementById('logSearch'),
    levelFilter: document.getElementById('levelFilter'),
    sourceFilter: document.getElementById('sourceFilter')
};

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await renderLogs();
    setupEventListeners();
});

function setupEventListeners() {
    elements.clearLogs.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all logs?')) {
            await clearLogs();
            await renderLogs();
        }
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
    const logs = await getLogs();
    const searchTerm = elements.logSearch.value.toLowerCase();
    const levelFilter = elements.levelFilter.value;
    const sourceFilter = elements.sourceFilter.value;

    const filteredLogs = logs.filter(log => {
        const matchesSearch = log.message.toLowerCase().includes(searchTerm) ||
            log.summary.toLowerCase().includes(searchTerm);
        const matchesLevel = levelFilter === 'all' || log.level === levelFilter;

        // Check source in data if available, or in message
        const source = log.data?.source || (log.message.includes('Bilibili') ? 'Bilibili' : log.message.includes('X') ? 'X' : 'unknown');
        const matchesSource = sourceFilter === 'all' || source === sourceFilter;

        return matchesSearch && matchesLevel && matchesSource;
    });

    if (filteredLogs.length === 0) {
        elements.logsList.innerHTML = '<div class="empty-state">No logs found matching filters.</div>';
        return;
    }

    elements.logsList.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleString();
        const source = log.data?.source || (log.message.includes('Bilibili') ? 'Bilibili' : log.message.includes('X') ? 'X' : '');

        return `
            <div class="log-entry ${log.level}" id="${log.id}">
                <div class="log-header">
                    <span class="log-level">${log.level}</span>
                    <span class="log-time">${timeStr}</span>
                </div>
                <div class="log-message">${log.message}</div>
                ${log.summary ? `<div class="log-summary">${log.summary}</div>` : ''}
                <div class="log-meta">
                    ${source ? `<span class="meta-item">📍 ${source}</span>` : ''}
                    ${log.data?.notionPageId ? `
                        <span class="meta-item">🔗 <a href="#" class="notion-link" data-id="${log.data.notionPageId}">Notion Page</a></span>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}
