/**
 * Synapse Background Service Worker
 * Handles auto-collection and message routing
 */

import { logger } from '../lib/logger.js';
import { uploadMedia } from '../lib/github-uploader.js';
import { saveToNotion, checkDuplicate, truncateText } from '../lib/notion-client.js';
import { validateConfig, getConfig, shouldCollect, updateLastCollectTime } from '../lib/storage.js';

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
        videoCount: content.videos?.length || 0
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
            collectedAt: content.collectedAt
        };

        await logger.info('🛠 DEBUG: Parsed content (NOT saved)', {
            summary: summary,
            data: debugData
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

    // Check for duplicates
    console.log('[Synapse] Checking for duplicates:', content.url);
    const isDuplicate = await checkDuplicate(content.url);
    if (isDuplicate) {
        console.warn('[Synapse] Duplicate content detected, skipping:', content.url);
        await logger.warn('Content already exists', { data: { url: content.url }, summary: summary });
        throw new Error('Content already saved');
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
        videos: videoUrls
    };

    // Save to Notion
    console.log('[Synapse] Saving to Notion database...');
    const result = await saveToNotion(notionContent);

    // Update last collect time
    await updateLastCollectTime();

    console.log('[Synapse] Content saved successfully to Notion:', result.url);
    await logger.success(`Saved from ${content.source}`, {
        data: {
            ...content,
            notionPageId: result.id,
            notionUrl: result.url,
            imagesUploaded: imageUrls.length
        },
        summary: summary
    });

    return result;
}

/**
 * Handle auto-collection request from content script
 */
async function handleAutoCollect(content: CollectedContent, sender: chrome.runtime.MessageSender): Promise<any> {
    const config = await getConfig();

    // In debug mode, skip interval check
    if (!config.debugMode) {
        const canCollect = await shouldCollect();
        if (!canCollect) {
            console.log('[Synapse] Skipping auto-collect, too soon since last collection');
            return { success: false, reason: 'interval' };
        }
    }

    // Determine target user based on source
    let targetUser: string | undefined;
    if (content.source === 'X') {
        targetUser = config.targetXUser;
    } else if (content.source === 'Bilibili') {
        targetUser = config.targetBilibiliUser;
    } else if (content.source === 'QZone') {
        targetUser = config.targetQZoneUser;
    }

    // Verify author matches target
    if (targetUser) {
        const author = content.author?.username || '';
        if (author.toLowerCase() !== targetUser.toLowerCase()) {
            console.log('[Synapse] Skipping, not target user:', author, 'vs', targetUser);
            return { success: false, reason: 'not_target_user' };
        }
    }

    // Process the content
    try {
        const result = await processContent(content);
        if (!result) {
            return { success: false, reason: 'empty_text' };
        }
        return { success: true, data: result };
    } catch (err: any) {
        await logger.error(`Auto-collect failed: ${err.message}`, { summary: truncateText(content.text) });
        return { success: false, error: err.message };
    }
}

/**
 * Handle batch auto-collection request from content script (for multiple items)
 */
async function handleAutoCollectBatch(contents: CollectedContent[], pageUID: string): Promise<any> {
    const config = await getConfig();

    // In debug mode, skip interval check
    if (!config.debugMode) {
        const canCollect = await shouldCollect();
        if (!canCollect) {
            console.log('[Synapse] Skipping auto-collect batch, too soon since last collection');
            return { success: false, reason: 'interval' };
        }
    }

    // Process each content item
    let collected = 0;
    let skipped = 0;
    let firstSource = contents[0]?.source || 'Unknown';

    for (const content of contents) {
        try {
            // Target user filtering
            if (content.source === 'Bilibili' && config.targetBilibiliUser) {
                if (pageUID && pageUID !== config.targetBilibiliUser) {
                    skipped++;
                    continue;
                }
            } else if (content.source === 'QZone' && config.targetQZoneUser) {
                if (pageUID && pageUID !== config.targetQZoneUser) {
                    skipped++;
                    continue;
                }
            } else if (content.source === 'X' && config.targetXUser) {
                const target = config.targetXUser.toLowerCase();
                if ((pageUID && pageUID.toLowerCase() !== target) ||
                    (content.author?.username && content.author.username.toLowerCase() !== target)) {
                    skipped++;
                    continue;
                }
            }

            const result = await processContent(content);
            if (result) {
                collected++;
            } else {
                skipped++;
            }
        } catch (err: any) {
            if (err.message.includes('already saved')) {
                skipped++;
            } else {
                await logger.error(`Batch item failed: ${err.message}`, { summary: truncateText(content.text) });
            }
        }
    }

    if (collected > 0) {
        await logger.success(`Batch complete: ${collected} saved, ${skipped} skipped`, {
            summary: `Collected ${collected} items from ${firstSource}`
        });
    }

    return { success: true, collected, skipped };
}

/**
 * Handle manual collection request (bypasses interval check)
 */
async function handleManualCollect(content: CollectedContent): Promise<any> {
    try {
        const result = await processContent(content);
        if (!result) {
            return { success: false, error: 'Empty text content' };
        }
        return { success: true, data: result };
    } catch (err: any) {
        await logger.error(`Manual collect failed: ${err.message}`, { summary: truncateText(content.text) });
        return { success: false, error: err.message };
    }
}

/**
 * Handle manual batch collection request (bypasses interval check)
 */
async function handleManualCollectBatch(contents: CollectedContent[], pageUID: string): Promise<any> {
    const config = await getConfig();
    let successCount = 0;
    let errors: string[] = [];

    await logger.info(`Manually processing batch of ${contents.length} items`);

    for (const content of contents) {
        try {
            if (content.source === 'Bilibili' && config.targetBilibiliUser) {
                const target = config.targetBilibiliUser.toLowerCase();
                const author = content.author?.username?.toLowerCase();

                if ((pageUID && pageUID.toLowerCase() !== target) || (author && author !== target)) {
                    continue;
                }
            }

            const isDup = await checkDuplicate(content.url);
            if (isDup) continue;

            const result = await processContent(content);
            if (result) {
                successCount++;
            }
        } catch (err: any) {
            errors.push(err.message);
        }
    }

    await logger.info(`Manual batch complete: ${successCount} saved, ${errors.length} failed`);
    return { success: true, collected: successCount, errors };
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

                case 'AUTO_COLLECT':
                    const autoResult = await handleAutoCollect(message.content, sender);
                    sendResponse(autoResult);
                    break;

                case 'AUTO_COLLECT_BATCH':
                    const batchResult = await handleAutoCollectBatch(message.contents, message.pageUID);
                    sendResponse(batchResult);
                    break;

                case 'MANUAL_COLLECT':
                    const manualResult = await handleManualCollect(message.content);
                    sendResponse(manualResult);
                    break;

                case 'MANUAL_COLLECT_BATCH':
                    const manualBatchResult = await handleManualCollectBatch(message.contents, message.pageUID);
                    sendResponse(manualBatchResult);
                    break;

                case 'PROCESS_CONTENT':
                    const result = await processContent(message.content);
                    sendResponse({ success: true, data: result });
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
                data: { type: message.type, error: err.message }
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
    } else if (details.reason === details.reason) { // Workaround for update check
        await logger.info('Synapse extension updated', {
            data: { previousVersion: (details as any).previousVersion }
        });
    }
});

console.log('[Synapse] Service worker started');
