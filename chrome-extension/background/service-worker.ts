/**
 * Synapse Background Service Worker
 * Handles auto-collection and message routing
 */

import { logger } from '../lib/logger.js';
import { uploadMedia } from '../lib/github-uploader.js';
import { saveToNotion, batchCheckDuplicates, truncateText, hashUrl, fetchAllHashesFromNotion } from '../lib/notion-client.js';
import { hashCache } from '../lib/hash-cache.js';
import { validateConfig, getConfig, updateLastCollectTime } from '../lib/storage.js';

// Global lock to prevent concurrent processing of batches
let isProcessing = false;
const processingQueue: Array<() => Promise<void>> = [];
const recentlyProcessedUrls = new Set<string>();

// Clear recently processed URLs every 10 minutes to prevent memory leaks
setInterval(
  () => {
    recentlyProcessedUrls.clear();
  },
  10 * 60 * 1000,
);

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
 * Process collected content: upload images and save to Notion
 * In debug mode: logs parsed JSON without saving
 */
async function processContent(content: CollectedContent): Promise<any> {
  // Requirement: text must be present to be saved
  if (!content.text || content.text.trim().length === 0) {
    console.log('[Synapse] Skipping content with empty text');
    return null;
  }

  const summary = truncateText(content.text);
  const config = await getConfig();

  console.log(`[Synapse] Processing content from ${content.source}:`, {
    url: content.url,
    imageCount: content.images?.length || 0,
    videoCount: content.videos?.length || 0,
  });

  // DEBUG MODE: Log JSON and skip all processing
  if (config.debugMode) {
    const debugData = {
      source: content.source,
      text: content.text,
      images: content.images || [],
      videos: content.videos || [],
      url: content.url,
      timestamp: content.timestamp,
      author: content.author,
      collectedAt: content.collectedAt,
    };

    await logger.info('🛠 DEBUG: Parsed content (NOT saved)', {
      summary: summary,
      data: debugData,
    });

    console.log('[Synapse DEBUG] Parsed content JSON:', JSON.stringify(debugData, null, 2));

    return { debug: true, content: debugData };
  }

  // Check configuration
  const configStatus = await validateConfig();
  if (!configStatus.valid) {
    const error = `Missing configuration: ${configStatus.missing.join(', ')}`;
    console.error('[Synapse] Configuration error:', error);
    await logger.error(error);
    throw new Error(error);
  }

  // Upload images to GitHub if present
  let imageUrls: string[] = [];
  if (content.images && content.images.length > 0) {
    console.log(`[Synapse] Uploading ${content.images.length} images to GitHub...`);
    imageUrls = await uploadMedia(content.images, 'image');
  }

  // Handle videos (MP4 from X)
  let videoUrls: string[] = [];
  if (content.videos && content.videos.length > 0) {
    console.log(`[Synapse] Processing ${content.videos.length} videos...`);
    videoUrls = await uploadMedia(content.videos, 'video');
  }

  // Prepare content for Notion
  const notionContent: CollectedContent = {
    ...content,
    images: imageUrls,
    videos: videoUrls,
  };

  // Save to Notion
  console.log('[Synapse] Saving to Notion database...');
  const result = await saveToNotion(notionContent);

  // Update last collect time for this source
  await updateLastCollectTime(content.source);

  // Add securely to hash cache to avoid duplicate saves in the future
  try {
    const urlHash = await hashUrl(content.url);
    if (urlHash) {
      await hashCache.addHash(urlHash);
      console.log(`[Synapse] Added hash ${urlHash} to local cache`);
    }
  } catch (err) {
    console.warn('[Synapse] Failed to add hash to cache:', err);
  }

  console.log('[Synapse] Content saved successfully to Notion:', result.url);
  await logger.success(`Saved from ${content.source}`, {
    data: {
      ...content,
      notionPageId: result.id,
      notionUrl: result.url,
      imagesUploaded: imageUrls.length,
    },
    summary: summary,
  });

  return result;
}

/**
 * Handle batch collection request from content script (for multiple items)
 */
async function handleCollectBatch(contents: CollectedContent[], pageUID: string): Promise<any> {
  await acquireLock();
  try {
    const config = await getConfig();

    // Process each content item
    let collected = 0;
    let skipped = 0;
    const firstSource = contents[0]?.source || 'Unknown';

    // Filter logic removed as contents are already guaranteed to be for the target account
    const filteredContents = contents;

    skipped += contents.length - filteredContents.length;

    // Batch check duplicates for remaining items
    const urls = filteredContents.map((c) => c.url).filter(Boolean);
    const existingUrls = await batchCheckDuplicates(urls);
    const processedInThisBatch = new Set<string>();

    if (urls.length > 0) {
      await logger.info(
        `Batch check duplicates: ${existingUrls.size} existing items found in ${urls.length} items`,
        {
          data: {
            totalChecked: urls.length,
            duplicatesFound: existingUrls.size,
            existingUrls: Array.from(existingUrls),
          },
        },
      );
    }

    for (const content of filteredContents) {
      try {
        if (
          existingUrls.has(content.url) ||
          processedInThisBatch.has(content.url) ||
          recentlyProcessedUrls.has(content.url)
        ) {
          skipped++;
          continue;
        }

        const result = await processContent(content);
        if (result) {
          collected++;
          processedInThisBatch.add(content.url);
          recentlyProcessedUrls.add(content.url);
        } else {
          skipped++;
        }
      } catch (err: any) {
        if (err.message.includes('already saved')) {
          skipped++;
        } else {
          await logger.error(`Batch item failed: ${err.message}`, {
            summary: truncateText(content.text),
            data: content,
          });
        }
      }
    }

    if (collected > 0) {
      await logger.success(`Batch complete: ${collected} saved, ${skipped} skipped`, {
        summary: `Collected ${collected} items from ${firstSource}`,
      });
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

        case 'GET_CACHE_COUNT':
          const count = await hashCache.getCount();
          sendResponse({ success: true, count });
          break;

        case 'CLEAR_CACHE':
          await hashCache.clearCache();
          console.log('[Synapse] Local hash cache cleared');
          sendResponse({ success: true });
          break;

        case 'REBUILD_CACHE':
          const hashes = await fetchAllHashesFromNotion();
          await hashCache.clearCache();
          await hashCache.addHashes(hashes);
          const newCount = await hashCache.getCount();
          console.log(`[Synapse] Local hash cache rebuilt with ${newCount} items`);
          sendResponse({ success: true, count: newCount });
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
