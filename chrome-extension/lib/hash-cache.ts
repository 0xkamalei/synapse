/**
 * HashID Cache using IndexedDB
 * Helps reduce Notion API calls by checking local cache for duplicates.
 */

const DB_NAME = 'synapse-hash-cache';
const STORE_NAME = 'hashes';
const DB_VERSION = 1;

export class HashCache {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    constructor() { }

    /**
     * Initialize the IndexedDB connection
     */
    async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('[Synapse] Error opening IndexedDB:', request.error);
                this.initPromise = null;
                reject(request.error);
            };

            request.onsuccess = (event) => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    // We only store hashes, so the key is the hash itself
                    db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Ensure DB is initialized before executing operations
     */
    private async ensureDb(): Promise<IDBDatabase> {
        await this.init();
        if (!this.db) throw new Error('IndexedDB not initialized');
        return this.db;
    }

    /**
     * Add a single hash to the cache
     */
    async addHash(hash: string): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.put({ hash, timestamp: Date.now() });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Add multiple hashes to the cache efficiently
     */
    async addHashes(hashes: string[]): Promise<void> {
        if (!hashes.length) return;
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const now = Date.now();

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);

            for (const hash of hashes) {
                store.put({ hash, timestamp: now });
            }
        });
    }

    /**
     * Check which of the given hashes exist in the cache
     * Returns a Set of existing hashes
     */
    async checkHashes(hashes: string[]): Promise<Set<string>> {
        const existingSets = new Set<string>();
        if (!hashes.length) return existingSets;

        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);

            let completedCount = 0;
            let hasError = false;

            for (const hash of hashes) {
                if (hasError) continue;

                const request = store.get(hash);
                request.onsuccess = () => {
                    if (request.result) {
                        existingSets.add(hash);
                    }
                    completedCount++;
                    if (completedCount === hashes.length) {
                        resolve(existingSets);
                    }
                };
                request.onerror = () => {
                    if (!hasError) {
                        hasError = true;
                        reject(request.error);
                    }
                };
            }

            // Handle the case where the loop is empty (handled by if above, but just in case)
            if (hashes.length === 0) resolve(existingSets);
        });
    }

    /**
     * Clear the entire cache
     */
    async clearCache(): Promise<void> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get total number of items in cache
     */
    async getCount(): Promise<number> {
        const db = await this.ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Export a singleton instance
export const hashCache = new HashCache();
