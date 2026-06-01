export const LogLevel: Record<string, LogLevelValue> = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SUCCESS: 'success',
};

const MAX_RECENT = 10;

class Logger {
  async log(
    level: LogLevelValue,
    message: string,
    options: { data?: any; summary?: string } = {},
  ): Promise<LogEntry> {
    const { data = {}, summary = '' } = options;

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      summary,
      data,
    };

    this.consoleLog(level, message, summary, data);

    if ((level === 'success' || level === 'error') && data.source) {
      await this.addRecentCollection(entry);
    }

    return entry;
  }

  private consoleLog(level: LogLevelValue, message: string, summary: string, data: any): void {
    const prefix = `[Synapse ${level.toUpperCase()}]`;
    const hasData = data && Object.keys(data).length > 0;

    if (hasData || summary) {
      const label = summary ? `${prefix} ${message} — ${summary}` : `${prefix} ${message}`;
      console.groupCollapsed(label);
      Object.entries(data).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          console.groupCollapsed(`  ${key} (${value.length})`);
          value.forEach((item, i) => console.log(`  [${i}]`, item));
          console.groupEnd();
        } else {
          console.log(`  ${key}:`, value);
        }
      });
      console.groupEnd();
    } else {
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      (console[method] as Function)(prefix, message);
    }
  }

  private async addRecentCollection(entry: LogEntry): Promise<void> {
    const { recentCollections = [] } = await chrome.storage.local.get('recentCollections');
    const updated = [entry, ...(recentCollections as LogEntry[])].slice(0, MAX_RECENT);
    await chrome.storage.local.set({ recentCollections: updated });
  }

  async getRecentCollections(): Promise<LogEntry[]> {
    const { recentCollections = [] } = await chrome.storage.local.get('recentCollections');
    return recentCollections as LogEntry[];
  }

  async clearRecentCollections(): Promise<void> {
    await chrome.storage.local.set({ recentCollections: [] });
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

  async success(
    message: string,
    options: { data?: any; summary?: string } = {},
  ): Promise<LogEntry> {
    return this.log(LogLevel.SUCCESS, message, options);
  }
}

export const logger = new Logger();

export async function getRecentCollections(): Promise<LogEntry[]> {
  return logger.getRecentCollections();
}
