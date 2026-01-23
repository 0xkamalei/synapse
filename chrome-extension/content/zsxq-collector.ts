/**
 * ZSXQ (知识星球) Content Collector
 * Extracts topic content from ZSXQ pages
 */
(() => {
  /**
   * Extract text content from a topic element
   * Handles "展开全部" (expand all) functionality
   */
  function extractZsxqText(topicElement: Element): string {
    // Find the content container
    const contentElement = topicElement.querySelector('.talk-content-container .content');
    if (!contentElement) return '';

    // Clone the element to avoid modifying the DOM
    const clonedContent = contentElement.cloneNode(true) as HTMLElement;

    // Extract text from all child nodes including emojis
    let text = '';

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;

        // Handle emoji images
        if (element.classList.contains('emoji_span')) {
          const img = element.querySelector('img');
          if (img) {
            const emojiTitle = img.getAttribute('data-title') || img.getAttribute('title');
            if (emojiTitle) {
              text += `[${emojiTitle}]`;
            }
          }
        }
        // Handle links - extract href and display text
        else if (element.tagName === 'A' && element.classList.contains('link-of-topic')) {
          const href = element.getAttribute('href');
          const linkText = element.textContent?.trim();
          if (href && linkText) {
            text += `${linkText} (${href})`;
          } else if (href) {
            text += href;
          } else if (linkText) {
            text += linkText;
          }
        }
        // Handle hashtags - extract both the link and text
        else if (element.tagName === 'A' && element.classList.contains('hashtag')) {
          const hashtagText = element.textContent?.trim();
          if (hashtagText) {
            text += hashtagText;
          }
        }
        // Process other elements recursively
        else {
          element.childNodes.forEach(processNode);
        }
      }
    };

    clonedContent.childNodes.forEach(processNode);

    return text.trim();
  }

  /**
   * Extract images from a topic element
   */
  function extractZsxqImages(topicElement: Element): string[] {
    const images: string[] = [];

    // Find the image gallery container
    const imageGallery = topicElement.querySelector('app-image-gallery .image-gallery-container');
    if (!imageGallery) return images;

    // Extract all images
    const imgElements = imageGallery.querySelectorAll('img.item');
    imgElements.forEach((img) => {
      const htmlImg = img as HTMLImageElement;
      const src = htmlImg.src;

      if (src && !src.startsWith('data:')) {
        // Keep the original URL with parameters (includes image processing params)
        if (!images.includes(src)) {
          images.push(src);
        }
      }
    });

    return images;
  }

  /**
   * Extract videos from a topic element
   * Note: ZSXQ doesn't seem to have direct video embeds in the HTML structure provided
   */
  function extractZsxqVideos(_topicElement: Element): string[] {
    // Currently no video support detected in the sample HTML
    // Could be extended if video support is added
    return [];
  }

  /**
   * Extract timestamp from a topic element
   */
  function extractZsxqTimestamp(topicElement: Element): string {
    // Find the date element in the header
    const dateElement = topicElement.querySelector('app-topic-header .date');
    if (!dateElement) {
      return new Date().toISOString();
    }

    const dateText = (dateElement as HTMLElement).innerText?.trim() || '';
    // Remove "阅读人数" part and extract date
    const datePart = dateText.split('阅读人数')[0].trim();

    // Parse date format: "2021-03-31 22:31" or similar
    // IMPORTANT: The time displayed is in UTC+8 timezone (China Standard Time)
    if (datePart.match(/\d{4}-\d{1,2}-\d{1,2}/)) {
      // Parse the date as UTC+8 by appending the timezone offset
      // Format: "2021-03-31 22:31" -> "2021-03-31T22:31:00+08:00"
      const isoDateStr = datePart.replace(' ', 'T') + ':00+08:00';
      const date = new Date(isoDateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return new Date().toISOString();
  }

  /**
   * Extract topic URL from a topic element
   * Uses text highlight approach since ZSXQ topics don't have unique URLs
   * and URLs will be processed with hashid
   */
  function extractZsxqUrl(topicElement: Element, textContent: string): string {
    // Get the base group URL without query parameters
    const baseUrl = window.location.href.split('?')[0];

    try {
      // Create a unique fragment identifier based on the first 50 chars of text content
      // Clean the text: remove emoji brackets, special chars that might cause encoding issues
      let textPreview = textContent.trim().substring(0, 50);

      // Remove emoji notation [emoji_name] and other potentially problematic characters
      textPreview = textPreview
        .replace(/\[.*?\]/g, '') // Remove [emoji] or [text] brackets
        .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // Keep only word chars, spaces, and Chinese chars
        .replace(/\s+/g, '-') // Replace spaces with dashes
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes

      // Ensure we have some text to work with
      if (!textPreview || textPreview.length < 3) {
        // Fallback: use timestamp-based identifier
        const timestamp = Date.now();
        return `${baseUrl}#topic-${timestamp}`;
      }

      // Encode the text preview for URL safety
      const encodedPreview = encodeURIComponent(textPreview);

      // Return URL with text fragment for highlighting
      return `${baseUrl}#:~:text=${encodedPreview}`;
    } catch (error) {
      // If encoding fails, use timestamp-based fallback
      console.warn('[Synapse ZSXQ] Failed to encode URL text preview:', error);
      const timestamp = Date.now();
      return `${baseUrl}#topic-${timestamp}`;
    }
  }

  /**
   * Extract author info from a topic element
   */
  function extractAuthorInfoZsxq(topicElement: Element): AuthorInfo {
    let username = '';
    let displayName = '';

    // Find the author name in the header
    const roleElement = topicElement.querySelector('app-topic-header .role');
    if (roleElement) {
      displayName = (roleElement as HTMLElement).innerText?.trim() || '';
    }

    // Extract username from avatar or other elements if available
    // For now, use the display name as username
    username = displayName;

    return { username, displayName };
  }

  /**
   * Extract tags/hashtags from the topic
   */
  function extractZsxqTags(topicElement: Element): string[] {
    const tags: string[] = [];

    // Find tags in the content
    const hashtagElements = topicElement.querySelectorAll('.talk-content-container .hashtag');
    hashtagElements.forEach((tag) => {
      const tagText = (tag as HTMLElement).innerText?.trim();
      if (tagText) {
        // Remove the # symbol if present
        const cleanTag = tagText.replace(/^#\s*/, '').trim();
        if (cleanTag && !tags.includes(cleanTag)) {
          tags.push(cleanTag);
        }
      }
    });

    // Also check the tag container
    const tagContainer = topicElement.querySelector('app-tag-container .tag-container');
    if (tagContainer) {
      const tagElements = tagContainer.querySelectorAll('.tag');
      tagElements.forEach((tag) => {
        const tagText = (tag as HTMLElement).innerText?.trim();
        if (tagText && !tags.includes(tagText)) {
          tags.push(tagText);
        }
      });
    }

    return tags;
  }

  /**
   * Find all topic elements on the current page
   */
  function findAllZsxqTopics(): Element[] {
    const selector = 'app-topic[type="flow"] .topic-container';
    const topics = Array.from(document.querySelectorAll(selector));

    return topics;
  }

  /**
   * Collect data from a single topic element
   */
  function collectZsxqTopicData(topicElement: Element): CollectedContent {
    const text = extractZsxqText(topicElement);
    const images = extractZsxqImages(topicElement);
    const videos = extractZsxqVideos(topicElement);
    const timestamp = extractZsxqTimestamp(topicElement);
    const url = extractZsxqUrl(topicElement, text); // Pass text for URL generation
    const author = extractAuthorInfoZsxq(topicElement);
    const tags = extractZsxqTags(topicElement);

    // Determine content type based on available content
    let type: ContentType = 'text';
    if (videos.length > 0) {
      type = 'video';
    } else if (images.length > 0) {
      type = 'image';
    } else if (text.includes('http://') || text.includes('https://')) {
      // Check if it's primarily a link share
      type = 'article';
    }

    return {
      text,
      images,
      videos,
      url,
      timestamp,
      author,
      collectedAt: new Date().toISOString(),
      source: 'ZSXQ',
      tags,
      type,
    };
  }

  /**
   * Check if the current page URL matches the target group
   */
  function isTargetGroupZsxq(targetGroup: string): boolean {
    const currentUrl = window.location.href;
    // Check if URL contains the target group ID
    // Format: https://wx.zsxq.com/group/48415284844818
    return currentUrl.includes(`/group/${targetGroup}`);
  }

  /**
   * Check if the current page matches any target group
   */
  function isTargetURL(targetGroups: string[]): boolean {
    if (!targetGroups || !Array.isArray(targetGroups) || targetGroups.length === 0) return false;
    return targetGroups.some((group) => isTargetGroupZsxq(group));
  }

  /**
   * Get page info for the popup display
   */
  async function getPageInfo(): Promise<PageInfo> {
    const currentUrl = window.location.href;

    // Get config to check if this is the target page
    const config = await chrome.storage.sync.get(['targetZsxqGroup']);
    let targetGroups = config.targetZsxqGroup as string[] | undefined;
    if (typeof targetGroups === 'string') targetGroups = [targetGroups];

    const isMatched = isTargetURL((targetGroups || []) as string[]);

    // Extract group info from page
    let groupName = '';
    const groupInfoElement = document.querySelector('.group-info-container .name');
    if (groupInfoElement) {
      groupName = (groupInfoElement as HTMLElement).innerText?.trim() || '';
    }

    // Extract group ID from URL
    const groupIdMatch = currentUrl.match(/\/group\/(\d+)/);
    const groupId = groupIdMatch ? groupIdMatch[1] : '';

    const topics = findAllZsxqTopics();

    return {
      isTargetPage: isMatched,
      itemCount: topics.length,
      currentUrl,
      pageIdentifier: groupId,
      // Additional platform-specific data
      pageTitle: groupName || document.title,
    };
  }

  /**
   * Auto-collect topics if on target group's page
   */
  async function tryAutoCollect(): Promise<void> {
    const config = await chrome.storage.sync.get(['targetZsxqGroup', 'enabledSources']);
    let targetGroups = config.targetZsxqGroup as string[] | undefined;
    if (typeof targetGroups === 'string') targetGroups = [targetGroups];

    const enabledSources = (config.enabledSources as string[]) || [];
    const autoCollect = enabledSources.includes('zsxq');

    if (
      !autoCollect ||
      !targetGroups ||
      !Array.isArray(targetGroups) ||
      targetGroups.length === 0
    ) {
      console.log('[Synapse ZSXQ] Auto-collect disabled or no target group configured');
      return;
    }

    if (!isTargetURL(targetGroups)) {
      console.log('[Synapse ZSXQ] Not on target group page');
      return;
    }

    console.log('[Synapse ZSXQ] On target group page, collecting topics...');

    const topics = findAllZsxqTopics();
    if (topics.length === 0) {
      console.log('[Synapse ZSXQ] No topics found on page');
      return;
    }

    const collectedContents: CollectedContent[] = [];
    for (const topic of topics) {
      const content = collectZsxqTopicData(topic);
      if (content.text && content.text.trim().length > 0) {
        collectedContents.push(content);
      }
    }

    if (collectedContents.length > 0) {
      console.log(
        `[Synapse ZSXQ] Collected ${collectedContents.length} topics, sending to background...`,
      );

      // Send to background for processing
      chrome.runtime.sendMessage(
        {
          type: 'CONTENT_TO_BG_PROCESS',
          contents: collectedContents,
          pageUID: `zsxq_${Date.now()}`,
        },
        (response) => {
          if (response?.success) {
            console.log(
              `[Synapse ZSXQ] Successfully processed: ${response.collected} saved, ${response.skipped} skipped`,
            );
          } else {
            console.error('[Synapse ZSXQ] Failed to process content:', response?.error);
          }
        },
      );
    }
  }

  // Initialize collector
  // Initialization logic
  console.log('[Synapse ZSXQ] Content script loaded');

  // Notify background that content script is ready
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'zsxq' });

  // Wait for DOM to be fully loaded before trying to collect
  const initCollector = () => {
    console.log('[Synapse ZSXQ] DOM ready, attempting auto-collect...');

    // Add a small delay to ensure Angular has rendered the content
    setTimeout(() => {
      tryAutoCollect();
    }, 1000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollector);
  } else {
    initCollector();
  }

  // Listen for URL changes (for SPA navigation)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[Synapse ZSXQ] URL changed, trying auto-collect...');
      // Wait for new content to render
      setTimeout(() => {
        tryAutoCollect();
      }, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'POP_TO_CONTENT_COLLECT') {
      console.log('[Synapse ZSXQ] Received collect request from popup');

      const topics = findAllZsxqTopics();
      const collectedContents: CollectedContent[] = [];

      for (const topic of topics) {
        const content = collectZsxqTopicData(topic);
        if (content.text && content.text.trim().length > 0) {
          collectedContents.push(content);
        }
      }

      if (collectedContents.length > 0) {
        // Send to background for processing
        chrome.runtime.sendMessage(
          {
            type: 'CONTENT_TO_BG_PROCESS',
            contents: collectedContents,
            pageUID: `zsxq_manual_${Date.now()}`,
          },
          (response) => {
            if (response?.success) {
              sendResponse({
                success: true,
                count: collectedContents.length,
                collected: response.collected,
                skipped: response.skipped,
              });
            } else {
              sendResponse({
                success: false,
                error: response?.error || 'Unknown error',
              });
            }
          },
        );
      } else {
        sendResponse({ success: false, error: 'No topics found' });
      }

      return true; // Async response
    } else if (message.type === 'GET_PAGE_INFO') {
      getPageInfo().then((pageInfo) => {
        sendResponse(pageInfo);
      });
      return true; // Async response
    }
  });

  console.log('[Synapse ZSXQ] Collector initialized');
})();
