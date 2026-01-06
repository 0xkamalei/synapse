/**
 * Synapse Logger
 * Manages collection logs for debugging
 */

const LogLevel = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    SUCCESS: 'success'
};

const MAX_LOGS = 200;

/**
 * Logger class for managing collection logs
 */
class Logger {
    /**
     * Add a log entry
     * @param {string} level - Log level (info, warn, error, success)
     * @param {string} message - Log message
     * @param {Object} options - Additional options {data, summary}
     * @returns {Promise<void>}
     */
    async log(level, message, options = {}) {
        const { data = {}, summary = '' } = options;

        const entry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            level,
            message,
            summary,  // Content summary for display
            data
        };

        const logs = await this.getLogs();
        logs.unshift(entry);

        // Keep only the most recent logs
        const trimmedLogs = logs.slice(0, MAX_LOGS);
        await chrome.storage.local.set({ logs: trimmedLogs });

        // Also log to console for development
        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[Synapse ${level.toUpperCase()}]`, message, data);

        return entry;
    }

    /**
     * Log info message
     * @param {string} message
     * @param {Object} data
     */
    async info(message, data = {}) {
        return this.log(LogLevel.INFO, message, data);
    }

    /**
     * Log warning message
     * @param {string} message
     * @param {Object} data
     */
    async warn(message, data = {}) {
        return this.log(LogLevel.WARN, message, data);
    }

    /**
     * Log error message
     * @param {string} message
     * @param {Object} data
     */
    async error(message, data = {}) {
        return this.log(LogLevel.ERROR, message, data);
    }

    /**
     * Log success message
     * @param {string} message
     * @param {Object} data
     */
    async success(message, data = {}) {
        return this.log(LogLevel.SUCCESS, message, data);
    }

    /**
     * Get all logs
     * @returns {Promise<Array>}
     */
    async getLogs() {
        const { logs = [] } = await chrome.storage.local.get('logs');
        return logs;
    }

    /**
     * Clear all logs
     * @returns {Promise<void>}
     */
    async clearLogs() {
        await chrome.storage.local.set({ logs: [] });
    }

    /**
     * Get logs filtered by level
     * @param {string} level
     * @returns {Promise<Array>}
     */
    async getLogsByLevel(level) {
        const logs = await this.getLogs();
        return logs.filter(log => log.level === level);
    }

    /**
     * Generate unique ID for log entry
     * @returns {string}
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Singleton instance
const logger = new Logger();

// Helper functions for direct import
async function getLogs() {
    return logger.getLogs();
}

async function clearLogs() {
    return logger.clearLogs();
}

export { logger, Logger, LogLevel, getLogs, clearLogs };

