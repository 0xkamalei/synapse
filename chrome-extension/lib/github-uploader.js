const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10MB limit for videos/GIFs
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for images

/**
 * Upload multiple media files to GitHub
 * @param {string[]} urls - Array of file URLs
 * @param {string} type - 'image' or 'video' for logging
 * @returns {Promise<string[]>} - Array of CDN URLs or original URLs if skipped
 */
async function uploadMedia(urls, type = 'media') {
    const results = [];

    for (const url of urls) {
        try {
            // Check size first without downloading full blob if possible, 
            // but fileUrlToBase64 does it anyway. Let's use the blob size.
            const { base64, mimeType, size } = await fileUrlToBase64(url);

            const isVideo = mimeType.startsWith('video/') || url.includes('.mp4');
            const limit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

            if (size > limit) {
                console.log(`[Synapse] ${type} is too large (${(size / 1024 / 1024).toFixed(2)}MB), using original URL:`, url);
                results.push(url);
                continue;
            }

            // Also check if it's a video but not something we definitely want to upload (like a "GIF")
            // On X, GIFs usually have 'tweet_video' or 'tweet_video_thumb' in URL
            const isProbablyGif = url.includes('tweet_video') || url.includes('giphy') || size < 2 * 1024 * 1024;

            if (isVideo && !isProbablyGif && size > 3 * 1024 * 1024) {
                console.log(`[Synapse] Video doesn't look like a GIF and is >3MB, keeping original URL:`, url);
                results.push(url);
                continue;
            }

            const cdnUrl = await uploadBase64ToGitHub(base64, mimeType, type, url);
            results.push(cdnUrl);
        } catch (error) {
            await logger.error(`Failed to process ${type}, using original URL`, { url, error: error.message });
            results.push(url); // Fallback to original URL on error
        }
    }

    return results;
}

/**
 * Upload base64 content to GitHub
 */
async function uploadBase64ToGitHub(base64, mimeType, type, originalUrl) {
    const config = await getConfig();
    const filename = generateFilename(mimeType);
    const path = getFilePath(filename);

    await logger.info(`Uploading ${type} to GitHub`, { path, originalUrl });

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
        throw new Error(`GitHub API error: ${response.status}`);
    }

    const result = await response.json();
    return `https://cdn.jsdelivr.net/gh/${config.githubOwner}/${config.githubRepo}@main/${path}`;
}

// This function is now deprecated in favor of uploadBase64ToGitHub inside uploadMedia
// but keeping the name if needed elsewhere or refactoring it.
async function uploadFileToGitHub(fileUrl, type = 'media') {
    const { base64, mimeType } = await fileUrlToBase64(fileUrl);
    return uploadBase64ToGitHub(base64, mimeType, type, fileUrl);
}

/**
 * Convert file URL to Base64
 * @param {string} url - URL to convert
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
async function fileUrlToBase64(url) {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve({
                base64,
                mimeType: blob.type,
                size: blob.size
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function getFilePath(filename) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    // Keep it in images/ for now or move to media/
    return `media/${year}/${month}/${filename}`;
}

export { uploadMedia, fileUrlToBase64 };
