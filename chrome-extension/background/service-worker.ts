/**
 * Synapse Background Service Worker
 * Handles auto-collection and message routing
 */

import { logger } from '../lib/logger.js';
import {
  upsertBatchToLocalServer,
  truncateText,
} from '../lib/local-server-client.js';
import { validateConfig, getConfig, updateLastCollectTime } from '../lib/storage.js';

// Global lock to prevent concurrent processing of batches
let isProcessing = false;
const processingQueue: Array<() => Promise<void>> = [];

async function acquireLock(): Promise<void> {
  if (!isProcessing) {
    isProcessing = true;
    return;
  }
  return new Promise((resolve) => {
    processingQueue.push(async () => {
      isProcessing = true;
      resolve();
    });
  });
}

function releaseLock(): void {
  isProcessing = false;
  if (processingQueue.length > 0) {
    const next = processingQueue.shift();
    if (next) next();
  }
}

/**
 * Handle batch collection request from content script.
 * Uses upsert so the server handles create-vs-update; no client-side duplicate check needed.
 */
async function handleCollectBatch(contents: CollectedContent[], _pageUID: string): Promise<any> {
  await acquireLock();
  try {
    const config = await getConfig();
    const firstSource = contents[0]?.source || 'Unknown';

    const validContents = contents.filter(
      (c) => c.text && c.text.trim().length > 0,
    );
    const skipped = contents.length - validContents.length;

    if (validContents.length === 0) {
      return { success: true, collected: 0, skipped };
    }

    if (config.debugMode) {
      for (const content of validContents) {
        await logger.info('🛠 DEBUG: Parsed content (NOT saved)', {
          summary: truncateText(content.text),
          data: content,
        });
        console.log('[Synapse DEBUG] Parsed content JSON:', JSON.stringify(content, null, 2));
      }
      return { success: true, collected: 0, skipped: validContents.length };
    }

    const configStatus = await validateConfig();
    if (!configStatus.valid) {
      const error = `Missing configuration: ${configStatus.missing.join(', ')}`;
      await logger.error(error);
      throw new Error(error);
    }

    const result = await upsertBatchToLocalServer(validContents);
    const saved: number = result?.saved ?? 0;
    const updated: number = result?.updated ?? 0;
    const errors: number = result?.errors ?? 0;
    const collected = saved + updated;

    if (validContents[0]) {
      await updateLastCollectTime(validContents[0].source);
    }

    if (collected > 0) {
      await logger.success(
        `Batch complete: ${saved} saved, ${updated} updated, ${errors} errors, ${skipped} skipped`,
        { summary: `Collected ${collected} items from ${firstSource}` },
      );
    }

    return { success: true, collected, skipped };
  } finally {
    releaseLock();
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'CONTENT_SCRIPT_READY':
          console.log(`[Synapse] Content script ready: ${message.source}`);
          sendResponse({ success: true });
          break;

        case 'CONTENT_TO_BG_PROCESS':
          const batchResult = await handleCollectBatch(message.contents, message.pageUID);
          sendResponse(batchResult);
          break;

        case 'VALIDATE_CONFIG':
          const configStatus = await validateConfig();
          sendResponse(configStatus);
          break;

        case 'GET_CONFIG':
          const config = await getConfig();
          sendResponse({ success: true, config });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err: any) {
      await logger.error('Error processing message', {
        data: { type: message.type, error: err.message },
      });
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true;
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await logger.info('Synapse extension installed');
    chrome.runtime.openOptionsPage();
  } else if (details.reason === details.reason) {
    // Workaround for update check
    await logger.info('Synapse extension updated', {
      data: { previousVersion: (details as any).previousVersion },
    });
  }
});

console.log('[Synapse] Service worker started');
