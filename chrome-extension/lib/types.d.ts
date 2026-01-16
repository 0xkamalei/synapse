/**
 * Synapse Unified Data Types
 * These are global types available throughout the extension.
 */

interface AuthorInfo {
    username: string;
    displayName: string;
}

type ContentType = 'text' | 'image' | 'video' | 'article' | 'unknown';

interface CollectedContent {
    source: 'X' | 'Bilibili' | 'QZone' | 'Weibo' | 'Redbook' | 'ZSXQ' | 'YouTube';
    type?: ContentType;
    text: string;
    images: string[];
    videos: string[];
    links?: string[];
    tags?: string[];
    timestamp: string;
    url: string;
    author: AuthorInfo;
    collectedAt: string;
    notionPageId?: string;
}

/**
 * Unified PageInfo interface for all collectors
 * Returned by GET_PAGE_INFO message handler
 */
interface PageInfo {
    /** Whether the current page matches the configured target */
    isTargetPage: boolean;
    /** Number of content items found on the page */
    itemCount: number;
    /** Current page URL */
    currentUrl: string;
    /** Optional: Platform-specific identifier (user ID, group ID, etc.) */
    pageIdentifier?: string;
    /** Optional: Additional platform-specific data */
    [key: string]: any;
}

type LogLevelValue = 'info' | 'warn' | 'error' | 'success';

interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevelValue;
    message: string;
    summary: string;
    data: any;
}

interface AppConfig {
    notionToken: string;
    notionDatabaseId: string;
    notionDataSourceId: string;
    githubToken: string;
    githubOwner: string;
    githubRepo: string;
    enabledSources: string[];
    targetXUser: string;
    targetBilibiliUser: string;
    targetQZoneUser: string;
    targetWeiboUser: string;
    targetRedbookUser: string;
    targetZsxqGroup?: string;
    targetYoutubeChannel?: string;
    collectIntervalHours?: number;
    lastCollectTime: string | null;
    lastCollectTimes?: Record<string, string>;
    debugMode: boolean;
}
