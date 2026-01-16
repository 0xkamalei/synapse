import { getConfig } from './storage.js';
import { logger } from './logger.js';

const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10MB limit for videos/GIFs
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for images

// Queue settings
const CONCURRENT_UPLOADS = 3; // Maximum concurrent uploads
const DELAY_BETWEEN_UPLOADS = 500; // Delay between uploads in ms
const MAX_RETRIES = 3; // Maximum retry attempts
const RETRY_DELAY = 2000; // Delay before retry in ms

// Upload queue
interface UploadTask {
    url: string;
    type: string;
    resolve: (value: string) => void;
    reject: (reason: any) => void;
}

class UploadQueue {
    private queue: UploadTask[] = [];
    private activeUploads = 0;

    async add(url: string, type: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, type, resolve, reject });
            this.process();
        });
    }

    private async process() {
        if (this.activeUploads >= CONCURRENT_UPLOADS || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift();
        if (!task) return;

        this.activeUploads++;

        try {
            const result = await this.processTask(task);
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.activeUploads--;
            
            // Add delay before processing next task
            if (this.queue.length > 0) {
                setTimeout(() => this.process(), DELAY_BETWEEN_UPLOADS);
            }
        }
    }

    private async processTask(task: UploadTask): Promise<string> {
        const { url, type } = task;

        try {
            const { base64, mimeType, size } = await fileUrlToBase64(url);

            const isVideo = mimeType.startsWith('video/') || url.includes('.mp4');
            const limit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

            if (size > limit) {
                console.log(`[Synapse] ${type} is too large (${(size / 1024 / 1024).toFixed(2)}MB), using original URL:`, url);
                return url;
            }

            const isProbablyGif = url.includes('tweet_video') || url.includes('giphy') || size < 2 * 1024 * 1024;

            if (isVideo && !isProbablyGif && size > 3 * 1024 * 1024) {
                console.log(`[Synapse] Video doesn't look like a GIF and is >3MB, keeping original URL:`, url);
                return url;
            }

            const cdnUrl = await uploadBase64ToGitHubWithRetry(base64, mimeType, type, url);
            return cdnUrl;
        } catch (err: any) {
            await logger.error(`Failed to process ${type}, using original URL`, { data: { url, error: err.message } });
            return url;
        }
    }
}

const uploadQueue = new UploadQueue();

/**
 * Upload multiple media files to GitHub with queue management
 */
export async function uploadMedia(urls: string[], type: string = 'media'): Promise<string[]> {
    const uploadPromises = urls.map(url => uploadQueue.add(url, type));
    return Promise.all(uploadPromises);
}

/**
 * Upload base64 content to GitHub with retry mechanism
 */
async function uploadBase64ToGitHubWithRetry(base64: string, mimeType: string, type: string, originalUrl: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await uploadBase64ToGitHub(base64, mimeType, type, originalUrl);
        } catch (error: any) {
            lastError = error;
            
            // Don't retry on 422 (file exists) or 401 (auth error)
            if (error.status === 422 || error.status === 401) {
                throw error;
            }

            if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAY * attempt; // Exponential backoff
                console.log(`[Synapse] Upload failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Upload failed after all retries');
}

/**
 * Upload base64 content to GitHub
 */
async function uploadBase64ToGitHub(base64: string, mimeType: string, type: string, originalUrl: string): Promise<string> {
    const config = await getConfig();
    const hash = await calculateHash(base64);
    const filename = generateFilename(hash, mimeType);
    const path = getFilePath(filename);

    const apiUrl = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`;

    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${config.githubToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            message: `Upload ${type}: ${filename}`,
            content: base64
        })
    });

    if (!response.ok) {
        // If file already exists, GitHub returns 422 if no sha is provided
        if (response.status === 422) {
            return `https://cdn.jsdelivr.net/gh/${config.githubOwner}/${config.githubRepo}@main/${path}`;
        }
        const error: any = new Error(`GitHub API error: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return `https://cdn.jsdelivr.net/gh/${config.githubOwner}/${config.githubRepo}@main/${path}`;
}

interface Base64Result {
    base64: string;
    mimeType: string;
    size: number;
}

/**
 * Convert file URL to Base64
 */
export async function fileUrlToBase64(url: string): Promise<Base64Result> {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                const base64 = reader.result.split(',')[1];
                resolve({
                    base64,
                    mimeType: blob.type,
                    size: blob.size
                });
            } else {
                reject(new Error('Failed to convert blob to base64'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function generateFilename(hash: string, mimeType: string): string {
    const extension = mimeType.split('/')[1] || 'bin';
    return `${hash}.${extension}`;
}

async function calculateHash(text: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getFilePath(filename: string): string {
    const now = new Date();
    const year = now.getFullYear();
    return `media/${year}/${filename}`;
}
