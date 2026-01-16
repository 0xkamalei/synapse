/**
 * Platform Configuration
 * Centralized platform definitions to ensure consistency across the extension
 */

/**
 * Platform configuration for UI elements and config mapping
 */
export const PLATFORMS = {
    x: { 
        toggle: 'enableX', 
        config: 'configX', 
        targetInput: 'targetXUser',
        configKey: 'targetXUser' as const
    },
    bilibili: { 
        toggle: 'enableBilibili', 
        config: 'configBilibili', 
        targetInput: 'targetBilibiliUser',
        configKey: 'targetBilibiliUser' as const
    },
    qzone: { 
        toggle: 'enableQZone', 
        config: 'configQZone', 
        targetInput: 'targetQZoneUser',
        configKey: 'targetQZoneUser' as const
    },
    weibo: { 
        toggle: 'enableWeibo', 
        config: 'configWeibo', 
        targetInput: 'targetWeiboUser',
        configKey: 'targetWeiboUser' as const
    },
    redbook: { 
        toggle: 'enableRedbook', 
        config: 'configRedbook', 
        targetInput: 'targetRedbookUser',
        configKey: 'targetRedbookUser' as const
    },
    zsxq: { 
        toggle: 'enableZsxq', 
        config: 'configZsxq', 
        targetInput: 'targetZsxqGroup',
        configKey: 'targetZsxqGroup' as const
    }
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

/**
 * Default enabled sources
 */
export const DEFAULT_ENABLED_SOURCES: PlatformKey[] = ['x', 'bilibili', 'qzone', 'weibo', 'redbook', 'zsxq'];

/**
 * All available platform keys
 */
export const ALL_PLATFORMS = Object.keys(PLATFORMS) as PlatformKey[];
