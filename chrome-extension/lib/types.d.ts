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
    source: 'X' | 'Bilibili' | 'QZone' | 'Weibo' | 'Redbook';
    type: ContentType;
    text: string;
    images: string[];
    videos: string[];
    links: string[];
    timestamp: string;
    url: string;
    author: AuthorInfo;
    collectedAt: string;
    notionPageId?: string;
}

interface PageInfo {
    currentUrl: string;
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
    collectIntervalHours?: number;
    lastCollectTime: string | null;
    lastCollectTimes?: Record<string, string>;
    debugMode: boolean;
}
