/**
 * Synapse Options Page
 * Configuration UI for the extension
 */

import { getConfig, saveConfig } from '../lib/storage.js';

// Platform configuration mapping
const PLATFORMS = {
    x: { toggle: 'enableX', config: 'configX', targetInput: 'targetXUser' },
    bilibili: { toggle: 'enableBilibili', config: 'configBilibili', targetInput: 'targetBilibiliUser' },
    qzone: { toggle: 'enableQZone', config: 'configQZone', targetInput: 'targetQZoneUser' },
    weibo: { toggle: 'enableWeibo', config: 'configWeibo', targetInput: 'targetWeiboUser' },
    redbook: { toggle: 'enableRedbook', config: 'configRedbook', targetInput: 'targetRedbookUser' }
} as const;

type PlatformKey = keyof typeof PLATFORMS;

// DOM Elements
const elements = {
    notionToken: document.getElementById('notionToken') as HTMLInputElement,
    notionDatabaseId: document.getElementById('notionDatabaseId') as HTMLInputElement,
    notionDataSourceId: document.getElementById('notionDataSourceId') as HTMLInputElement,
    githubToken: document.getElementById('githubToken') as HTMLInputElement,
    githubOwner: document.getElementById('githubOwner') as HTMLInputElement,
    githubRepo: document.getElementById('githubRepo') as HTMLInputElement,
    // Platform toggles
    enableX: document.getElementById('enableX') as HTMLInputElement,
    enableBilibili: document.getElementById('enableBilibili') as HTMLInputElement,
    enableQZone: document.getElementById('enableQZone') as HTMLInputElement,
    enableWeibo: document.getElementById('enableWeibo') as HTMLInputElement,
    enableRedbook: document.getElementById('enableRedbook') as HTMLInputElement,
    // Platform config sections
    configX: document.getElementById('configX') as HTMLElement,
    configBilibili: document.getElementById('configBilibili') as HTMLElement,
    configQZone: document.getElementById('configQZone') as HTMLElement,
    configWeibo: document.getElementById('configWeibo') as HTMLElement,
    configRedbook: document.getElementById('configRedbook') as HTMLElement,
    // Target user inputs
    targetXUser: document.getElementById('targetXUser') as HTMLInputElement,
    targetBilibiliUser: document.getElementById('targetBilibiliUser') as HTMLInputElement,
    targetQZoneUser: document.getElementById('targetQZoneUser') as HTMLInputElement,
    targetWeiboUser: document.getElementById('targetWeiboUser') as HTMLInputElement,
    targetRedbookUser: document.getElementById('targetRedbookUser') as HTMLInputElement,
    // Other settings
    collectIntervalHours: document.getElementById('collectIntervalHours') as HTMLInputElement,
    debugMode: document.getElementById('debugMode') as HTMLInputElement,
    lastCollectInfo: document.getElementById('lastCollectInfo') as HTMLElement,
    saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
    saveStatus: document.getElementById('saveStatus') as HTMLElement
};

/**
 * Update platform config visibility based on toggle state
 */
function updatePlatformVisibility(platform: PlatformKey) {
    const { toggle, config } = PLATFORMS[platform];
    const toggleEl = elements[toggle as keyof typeof elements] as HTMLInputElement;
    const configEl = elements[config as keyof typeof elements] as HTMLElement;
    
    if (toggleEl && configEl) {
        configEl.classList.toggle('hidden', !toggleEl.checked);
    }
}

/**
 * Get enabled sources from toggle states
 */
function getEnabledSources(): string[] {
    const sources: string[] = [];
    for (const platform of Object.keys(PLATFORMS) as PlatformKey[]) {
        const toggleEl = elements[PLATFORMS[platform].toggle as keyof typeof elements] as HTMLInputElement;
        if (toggleEl?.checked) {
            sources.push(platform);
        }
    }
    return sources;
}

/**
 * Load saved configuration
 */
async function loadConfig() {
    const config = await getConfig();

    elements.notionToken.value = config.notionToken || '';
    elements.notionDatabaseId.value = config.notionDatabaseId || '';
    elements.notionDataSourceId.value = config.notionDataSourceId || '';
    elements.githubToken.value = config.githubToken || '';
    elements.githubOwner.value = config.githubOwner || '';
    elements.githubRepo.value = config.githubRepo || '';
    elements.targetXUser.value = config.targetXUser || '';
    elements.targetBilibiliUser.value = config.targetBilibiliUser || '';
    elements.targetQZoneUser.value = config.targetQZoneUser || '';
    elements.targetWeiboUser.value = config.targetWeiboUser || '';
    elements.targetRedbookUser.value = config.targetRedbookUser || '';
    elements.collectIntervalHours.value = (config.collectIntervalHours ?? 4).toString();
    elements.debugMode.checked = config.debugMode || false;

    // Set toggle states based on enabledSources
    const enabledSources = config.enabledSources || ['x', 'bilibili', 'qzone', 'weibo', 'redbook'];
    elements.enableX.checked = enabledSources.includes('x');
    elements.enableBilibili.checked = enabledSources.includes('bilibili');
    elements.enableQZone.checked = enabledSources.includes('qzone');
    elements.enableWeibo.checked = enabledSources.includes('weibo');
    elements.enableRedbook.checked = enabledSources.includes('redbook');

    // Update visibility for all platforms
    for (const platform of Object.keys(PLATFORMS) as PlatformKey[]) {
        updatePlatformVisibility(platform);
    }

    // Display last collect time
    if (config.lastCollectTime) {
        const date = new Date(config.lastCollectTime);
        elements.lastCollectInfo.textContent = `Last collected: ${date.toLocaleString()}`;
    } else {
        elements.lastCollectInfo.textContent = 'Last collected: Never';
    }
}

/**
 * Save configuration
 */
async function handleSave() {
    const currentConfig = await getConfig();
    const config: AppConfig = {
        ...currentConfig,
        notionToken: elements.notionToken.value.trim(),
        notionDatabaseId: elements.notionDatabaseId.value.trim(),
        notionDataSourceId: elements.notionDataSourceId.value.trim(),
        githubToken: elements.githubToken.value.trim(),
        githubOwner: elements.githubOwner.value.trim(),
        githubRepo: elements.githubRepo.value.trim(),
        targetXUser: elements.targetXUser.value.trim().replace('@', ''),
        targetBilibiliUser: elements.targetBilibiliUser.value.trim(),
        targetQZoneUser: elements.targetQZoneUser.value.trim(),
        targetWeiboUser: elements.targetWeiboUser.value.trim(),
        targetRedbookUser: elements.targetRedbookUser.value.trim(),
        collectIntervalHours: elements.collectIntervalHours.value === '' ? 4 : parseInt(elements.collectIntervalHours.value, 10),
        debugMode: elements.debugMode.checked,
        enabledSources: getEnabledSources()
    };

    try {
        await saveConfig(config);
        elements.saveStatus.textContent = '✅ Saved!';
        elements.saveStatus.className = 'save-status success';

        setTimeout(() => {
            elements.saveStatus.textContent = '';
        }, 2000);
    } catch (error) {
        elements.saveStatus.textContent = '❌ Error saving';
        elements.saveStatus.className = 'save-status error';
    }
}

// Event listeners
elements.saveBtn.addEventListener('click', handleSave);

// Platform toggle listeners
for (const platform of Object.keys(PLATFORMS) as PlatformKey[]) {
    const toggleEl = elements[PLATFORMS[platform].toggle as keyof typeof elements] as HTMLInputElement;
    if (toggleEl) {
        toggleEl.addEventListener('change', () => updatePlatformVisibility(platform));
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', loadConfig);
