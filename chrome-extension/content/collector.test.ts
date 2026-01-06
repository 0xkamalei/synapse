import { expect, test, describe, beforeAll, beforeEach, afterEach, spyOn } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

// Setup basic globals before anything else
const initialWindow = new Window();
globalThis.window = initialWindow as any;
globalThis.document = initialWindow.document as any;
globalThis.Element = initialWindow.Element as any;
globalThis.Node = initialWindow.Node as any;
globalThis.HTMLElement = initialWindow.HTMLElement as any;
globalThis.MutationObserver = initialWindow.MutationObserver as any;
globalThis.chrome = {
    runtime: {
        sendMessage: () => {},
        onMessage: {
            addListener: () => {}
        },
        getURL: (path: string) => `chrome-extension://id/${path}`
    }
} as any;

const TARGET_HTML_DIR = join(import.meta.dir, "../target-html");

function updateDOM(htmlPath: string) {
    const html = readFileSync(htmlPath, "utf-8");
    (globalThis.document as any).write(html);
}

describe("Collectors", () => {
    let xCollector: any;
    let bilibiliCollector: any;
    let qzoneCollector: any;
    let originalDate: any;

    beforeAll(async () => {
        // Mock global variables before loading collectors
        globalThis.HTMLAnchorElement = initialWindow.HTMLAnchorElement as any;

        // Mock window.location more robustly
        Object.defineProperty(globalThis.window, 'location', {
            value: {
                hostname: '',
                pathname: '',
                href: '',
                search: '',
                hash: '',
                protocol: 'https:',
            },
            writable: true
        });

        // Load collectors by reading the compiled JS files and evaluating them in global scope
        const collectors = [
            'dist/content/x-collector.js',
            'dist/content/bilibili-collector.js',
            'dist/content/qzone-collector.js'
        ];

        for (const relPath of collectors) {
            const absPath = join(import.meta.dir, '..', relPath);
            if (existsSync(absPath)) {
                let content = readFileSync(absPath, 'utf8');
                
                // Remove "use strict" to allow eval to define globals
                content = content.replace(/"use strict";/g, '');

                // Strip export keywords for eval compatibility
                content = content.replace(/^export\s+/gm, '');
                content = content.replace(/^export\s+\{.*\};?\s*$/gm, '');
                
                // Replace const/let with var to avoid "already defined" errors in eval
                content = content.replace(/^(const|let)\s+/gm, 'var ');
                
                try {
                    // Execute in global scope using indirect eval
                    const globalEval = eval;
                    globalEval(content);
                } catch (e) {
                    console.error(`Error evaluating ${relPath}:`, e);
                }
            } else {
                console.warn(`Warning: Compiled collector not found at ${absPath}. Run build first.`);
            }
        }
    });

    beforeEach(() => {
        // Mock Date to return a fixed date for relative time parsing
        const fixedDate = new Date("2024-01-01T12:00:00Z");
        originalDate = globalThis.Date;
        
        const MockDate = function(this: Date, ...args: any[]) {
            if (args.length > 0) return new (originalDate as any)(...args);
            return new (originalDate as any)(fixedDate);
        } as any;
        
        MockDate.prototype = originalDate.prototype;
        MockDate.now = () => fixedDate.getTime();
        MockDate.UTC = originalDate.UTC;
        MockDate.parse = originalDate.parse;
        
        globalThis.Date = MockDate;
    });

    afterEach(() => {
        // Restore Date
        globalThis.Date = originalDate;
    });

    function updateDOMWithUrl(htmlPath: string, url: string = 'https://example.com') {
        const html = readFileSync(htmlPath, "utf-8");
        const urlObj = new URL(url);
        
        // Use a more robust way to update DOM
        const dom = new Window();
        
        // Update location mock on the NEW window
        try {
            (dom as any).happyDOM?.setURL(url);
        } catch (e) {
            (dom.location as any).hostname = urlObj.hostname;
            (dom.location as any).pathname = urlObj.pathname;
            (dom.location as any).href = url;
        }

        const newDoc = dom.document;
        (newDoc as any).write(html);
        
        globalThis.window = dom as any;
        globalThis.document = newDoc as any;
    }

    test("X.com Collector", () => {
        const htmlPath = join(TARGET_HTML_DIR, "x.html");
        const jsonPath = join(TARGET_HTML_DIR, "x.json");
        
        updateDOMWithUrl(htmlPath, "https://x.com/home");
        
        const tweets = (globalThis as any).findAllTweetsX();
        expect(tweets.length).toBeGreaterThan(0);
        
        const results = tweets.map((t: any) => (globalThis as any).collectTweetDataX(t));
        
        // Only override collectedAt, but keep the parsed timestamp
        results.forEach((r: any) => {
            r.collectedAt = "2024-01-01T00:00:00.000Z";
        });

        if (!existsSync(jsonPath)) {
            writeFileSync(jsonPath, JSON.stringify(results, null, 2));
            console.log(`Created ${jsonPath} with collected data. Please review it.`);
        } else {
            const expected = JSON.parse(readFileSync(jsonPath, "utf-8"));
            expect(results).toEqual(expected);
        }
    });

    test("Bilibili Collector", () => {
        const htmlPath = join(TARGET_HTML_DIR, "bilibili.html");
        const jsonPath = join(TARGET_HTML_DIR, "bilibili.json");
        
        updateDOMWithUrl(htmlPath, "https://t.bilibili.com/");
  
        const dynamics = (globalThis as any).findAllDynamicsBilibili();
        expect(dynamics.length).toBeGreaterThan(0);
        
        const results = dynamics.map((d: any) => (globalThis as any).collectDynamicDataBilibili(d));
        
        // Only override collectedAt, but keep the parsed timestamp
        results.forEach((r: any) => {
            r.collectedAt = "2024-01-01T00:00:00.000Z";
        });

        // Only save if file doesn't exist
        if (!existsSync(jsonPath)) {
            writeFileSync(jsonPath, JSON.stringify(results, null, 2));
            console.log(`Created ${jsonPath}. Please review it.`);
        }

        const expected = JSON.parse(readFileSync(jsonPath, "utf-8"));
        expect(results).toEqual(expected);
    });

    test("QZone Collector", () => {
        const htmlPath = join(TARGET_HTML_DIR, "qq.html");
        const jsonPath = join(TARGET_HTML_DIR, "qq.json");
        
        updateDOMWithUrl(htmlPath, "https://user.qzone.qq.com/852872578");
        
        const feeds = (globalThis as any).findAllFeedsQZone();
        
        const results = feeds.map((f: any) => (globalThis as any).collectFeedDataQZone(f));
        
        // Only override collectedAt, but keep the parsed timestamp
        results.forEach((r: any) => {
            r.collectedAt = "2024-01-01T00:00:00.000Z";
        });

        if (!existsSync(jsonPath)) {
            writeFileSync(jsonPath, JSON.stringify(results, null, 2));
            console.log(`Created ${jsonPath}. Please review it.`);
        } else {
            const expected = JSON.parse(readFileSync(jsonPath, "utf-8"));
            expect(results).toEqual(expected);
        }
    });
});
