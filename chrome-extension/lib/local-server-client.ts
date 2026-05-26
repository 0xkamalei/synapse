/**
 * Synapse Local Server Client
 * Handles saving collected content to the local Synapse server.
 */

import { getConfig } from './storage.js';
import { logger } from './logger.js';

interface LocalServerImage {
  data: string;
  mime_type: string;
  original_url: string;
}

export interface URLTask {
  id: string;
  url: string;
  enabled: boolean;
  time: string;
}

interface LocalServerContent extends Omit<CollectedContent, 'images'> {
  images: LocalServerImage[];
  title?: string;
}

interface Base64Result {
  base64: string;
  mimeType: string;
}

/**
 * Truncate text to specified length.
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Save content to the local server.
 */
export async function saveToLocalServer(content: CollectedContent): Promise<any> {
  const payload = await toLocalServerPayload(content);
  const result = await requestLocalServer('/collect', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.status === 409) {
    throw new Error('content already saved');
  }

  if (!result.ok) {
    throw new Error(`Local server error: ${result.error}`);
  }

  return result.data;
}

/**
 * Upsert content to the local server (create or fully overwrite).
 */
export async function upsertToLocalServer(content: CollectedContent): Promise<any> {
  const payload = await toLocalServerPayload(content);
  const result = await requestLocalServer('/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    throw new Error(`Local server upsert error: ${result.error}`);
  }

  return result.data;
}

/**
 * Upsert a batch of content items to the local server.
 * Returns {saved, updated, errors, results}.
 */
export async function upsertBatchToLocalServer(contents: CollectedContent[]): Promise<any> {
  const items = await Promise.all(contents.map(toLocalServerPayload));
  const result = await requestLocalServer('/upsert/batch', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });

  if (!result.ok) {
    throw new Error(`Local server upsert batch error: ${result.error}`);
  }

  return result.data;
}

/**
 * Check if multiple URLs already exist on the local server.
 * Returns a Set of URLs that already exist.
 */
export async function batchCheckDuplicates(urls: string[]): Promise<Set<string>> {
  const existingUrls = new Set<string>();
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

  if (uniqueUrls.length === 0) {
    return existingUrls;
  }

  console.log(`[Synapse] Batch checking ${uniqueUrls.length} URLs against local server...`);

  const result = await requestLocalServer('/check/batch', {
    method: 'POST',
    body: JSON.stringify({ urls: uniqueUrls }),
  });

  if (!result.ok) {
    await logger.warn('Local server duplicate check failed', {
      data: { error: result.error, status: result.status },
    });
    return existingUrls;
  }

  const serverExistingUrls = Array.isArray(result.data?.existing) ? result.data.existing : [];
  for (const url of serverExistingUrls) {
    existingUrls.add(url);
  }

  return existingUrls;
}

/**
 * Fetch scheduled tasks from the local server.
 */
export async function getScheduledTasks(): Promise<URLTask[]> {
  const result = await requestLocalServer('/tasks', {
    method: 'GET',
  });

  if (!result.ok) {
    await logger.warn('Local server get tasks failed', {
      data: { error: result.error, status: result.status },
    });
    return [];
  }

  return Array.isArray(result.data?.tasks) ? result.data.tasks : [];
}

/**
 * Save scheduled tasks to the local server.
 */
export async function saveScheduledTasks(tasks: URLTask[]): Promise<boolean> {
  const result = await requestLocalServer('/tasks', {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  });

  if (!result.ok) {
    throw new Error(`Local server save tasks error: ${result.error}`);
  }

  return true;
}

async function toLocalServerPayload(content: CollectedContent): Promise<LocalServerContent> {
  const images = await Promise.all((content.images || []).map((url) => imageUrlToServerImage(url)));

  return {
    ...content,
    title: truncateText(content.text, 64),
    images,
    videos: content.videos || [],
    links: content.links || [],
    tags: content.tags || [],
  };
}

async function imageUrlToServerImage(url: string): Promise<LocalServerImage> {
  const fallback: LocalServerImage = {
    data: '',
    mime_type: '',
    original_url: url,
  };

  try {
    const { base64, mimeType } = await fileUrlToBase64(url);
    return {
      data: base64,
      mime_type: mimeType,
      original_url: url.startsWith('data:') ? '' : url,
    };
  } catch (err: any) {
    await logger.warn('Failed to load image for local server, keeping remote fallback', {
      data: { url: url.startsWith('data:') ? 'data-url' : url, error: err.message },
    });
    return fallback;
  }
}

async function fileUrlToBase64(url: string): Promise<Base64Result> {
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    return {
      mimeType: matches[1],
      base64: matches[2],
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve({
          base64: reader.result.split(',')[1],
          mimeType: blob.type || 'application/octet-stream',
        });
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function requestLocalServer(path: string, init: RequestInit): Promise<any> {
  const config = await getConfig();

  if (!config.localServerUrl || !config.localServerToken) {
    return {
      ok: false,
      status: 0,
      error: 'Local server configuration incomplete (URL or token missing)',
    };
  }

  const baseUrl = config.localServerUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.localServerToken}`,
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: data?.error || data?.message || response.statusText,
  };
}
