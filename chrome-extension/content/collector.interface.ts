/**
 * Collector Interface
 * Defines the contract for all content collectors in Synapse.
 * 
 * Each collector is injected into a specific website and handles:
 * 1. Detecting if the current page is a target user's profile
 * 2. Extracting content from the page
 * 3. Auto-collecting on page load (no scroll-triggered collection)
 * 4. Responding to messages from popup/background
 */

/**
 * Message types for collector communication
 */
interface CollectorMessageTypes {
    /** Request to collect current/main content */
    COLLECT_CURRENT: string;
    /** Result of collection operation */
    COLLECT_RESULT: string;
    /** Request page info for popup display */
    GET_PAGE_INFO: string;
}

/**
 * Configuration for a collector
 */
interface CollectorConfig {
    /** Unique identifier for the source (x, bilibili, qzone, weibo) */
    sourceId: string;
    /** Display name for the source */
    sourceName: 'X' | 'Bilibili' | 'QZone' | 'Weibo';
    /** Config key for target user setting */
    targetUserConfigKey: string;
}

/**
 * Interface that all collectors should implement
 * 
 * Note: Since collectors are injected into different websites,
 * naming conflicts are not a concern. Each collector can use
 * its own function names internally.
 */
interface Collector {
    /**
     * Get the collector configuration
     */
    getConfig(): CollectorConfig;

    /**
     * Check if the current page URL matches the target user's profile
     * @param targetUser - The configured target user ID
     */
    isTargetURL(targetUser: string): boolean;

    /**
     * Get page info for the popup display
     * Returns information about the current page state
     */
    getPageInfo(): Promise<PageInfo>;

    /**
     * Find all content elements on the current page
     * Returns array of parsed content objects
     */
    findAllContent(): CollectedContent[];

    /**
     * Collect data from a single element
     * @param element - The DOM element to extract data from
     */
    collectElementData(element: Element): CollectedContent;

    /**
     * Auto-collect content if on target user's page
     * Called on page load and URL changes (not on scroll)
     */
    tryAutoCollect(): Promise<void>;
}

/**
 * Standard initialization pattern for collectors
 * 
 * Each collector should implement this pattern:
 * 
 * ```typescript
 * (() => {
 *     // 1. Notify background that content script is ready
 *     chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', source: 'x' });
 *     
 *     // 2. Try auto-collect on initial load
 *     tryAutoCollect();
 *     
 *     // 3. Listen for URL changes (for SPA navigation)
 *     let lastUrl = window.location.href;
 *     const observer = new MutationObserver(() => {
 *         if (window.location.href !== lastUrl) {
 *             lastUrl = window.location.href;
 *             tryAutoCollect();
 *         }
 *     });
 *     observer.observe(document.body, { childList: true, subtree: true });
 *     
 *     // NOTE: No scroll event listener - collection is only triggered by:
 *     // - Initial page load
 *     // - URL changes (SPA navigation)
 *     // - Manual collection from popup
 * })();
 * ```
 */

/**
 * Standard message listener pattern
 * 
 * Each collector should handle these message types:
 * 
 * - COLLECT_CURRENT: Collect main content from page
 * - POP_TO_CONTENT_COLLECT: Collect all content and send to background
 * - GET_PAGE_INFO: Return page state for popup display
 */

export type { Collector, CollectorConfig, CollectorMessageTypes };

// Note: PageInfo is defined in lib/types.d.ts as a global type
