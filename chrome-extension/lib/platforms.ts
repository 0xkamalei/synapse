/**
 * Platform Configuration
 * Centralized platform definitions to ensure consistency across the extension
 */

/**
 * Build the collection URL for a given platform and account identifier.
 * Returns null if the platform doesn't support URL construction.
 */
export function buildPlatformUrl(platform: string, accountId: string): string | null {
  if (!accountId) return null;
  switch (platform) {
    case 'x':
      return `https://x.com/${accountId}`;
    case 'bilibili':
      return `https://space.bilibili.com/${accountId}/dynamic`;
    case 'weibo':
      return `https://weibo.com/u/${accountId}`;
    case 'redbook':
      return `https://www.xiaohongshu.com/user/profile/${accountId}`;
    case 'qzone':
      return `https://user.qzone.qq.com/${accountId}`;
    case 'zsxq':
      return `https://wx.zsxq.com/group/${accountId}`;
    case 'youtube':
      return `https://www.youtube.com/@${accountId}/videos`;
    case 'wxh':
      return accountId; // album URL is used directly
    default:
      return null;
  }
}

/**
 * Platform configuration for UI elements and config mapping
 */
export const PLATFORMS = {
  x: {
    toggle: 'enableX',
    config: 'configX',
    targetInput: 'targetXUser',
    configKey: 'targetXUser' as const,
  },
  bilibili: {
    toggle: 'enableBilibili',
    config: 'configBilibili',
    targetInput: 'targetBilibiliUser',
    configKey: 'targetBilibiliUser' as const,
  },
  qzone: {
    toggle: 'enableQZone',
    config: 'configQZone',
    targetInput: 'targetQZoneUser',
    configKey: 'targetQZoneUser' as const,
  },
  weibo: {
    toggle: 'enableWeibo',
    config: 'configWeibo',
    targetInput: 'targetWeiboUser',
    configKey: 'targetWeiboUser' as const,
  },
  redbook: {
    toggle: 'enableRedbook',
    config: 'configRedbook',
    targetInput: 'targetRedbookUser',
    configKey: 'targetRedbookUser' as const,
  },
  zsxq: {
    toggle: 'enableZsxq',
    config: 'configZsxq',
    targetInput: 'targetZsxqGroup',
    configKey: 'targetZsxqGroup' as const,
  },
  youtube: {
    toggle: 'enableYoutube',
    config: 'configYoutube',
    targetInput: 'targetYoutubeChannel',
    configKey: 'targetYoutubeChannel' as const,
  },
  wxh: {
    toggle: 'enableWxh',
    config: 'configWxh',
    targetInput: 'targetWxhAlbum',
    configKey: 'targetWxhAlbum' as const,
  },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

/**
 * Default enabled sources
 */
export const DEFAULT_ENABLED_SOURCES: PlatformKey[] = [
  'x',
  'bilibili',
  'qzone',
  'weibo',
  'redbook',
  'zsxq',
  'youtube',
  'wxh',
];

/**
 * All available platform keys
 */
export const ALL_PLATFORMS = Object.keys(PLATFORMS) as PlatformKey[];
