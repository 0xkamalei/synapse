/**
 * Synapse Logger
 * Manages collection logs for debugging
 */
export const LogLevel: Record<string, LogLevelValue> = {
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
     */
    async log(level: LogLevelValue, message: string, options: { data?: any; summary?: string } = {}): Promise<LogEntry> {
        const { data = {}, summary = '' } = options;

        const entry: LogEntry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            level,
            message,
            summary,
            data
        };

        const logs = await this.getLogs();
        logs.unshift(entry);

        const trimmedLogs = logs.slice(0, MAX_LOGS);
        await chrome.storage.local.set({ logs: trimmedLogs });

        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        if (console[consoleMethod]) {
            (console[consoleMethod] as Function)(`[Synapse ${level.toUpperCase()}]`, message, data);
        }

        return entry;
    }

    async info(message: string, options: { data?: any; summary?: string } = {}): Promise<LogEntry> {
        return this.log(LogLevel.INFO, message, options);
    }

    async warn(message: string, options: { data?: any; summary?: string } = {}): Promise<LogEntry> {
        return this.log(LogLevel.WARN, message, options);
    }

    async error(message: string, options: { data?: any; summary?: string } = {}): Promise<LogEntry> {
        return this.log(LogLevel.ERROR, message, options);
    }

    async success(message: string, options: { data?: any; summary?: string } = {}): Promise<LogEntry> {
        return this.log(LogLevel.SUCCESS, message, options);
    }

    async getLogs(): Promise<LogEntry[]> {
        const { logs = [] } = await chrome.storage.local.get('logs');
        return logs as LogEntry[];
    }

    async clearLogs(): Promise<void> {
        await chrome.storage.local.set({ logs: [] });
    }

    async getLogsByLevel(level: LogLevelValue): Promise<LogEntry[]> {
        const logs = await this.getLogs();
        return logs.filter(log => log.level === level);
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}

export const logger = new Logger();

export async function getLogs(): Promise<LogEntry[]> {
    return logger.getLogs();
}

export async function clearLogs(): Promise<void> {
    return logger.clearLogs();
}
