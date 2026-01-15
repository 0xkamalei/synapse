/**
 * Migration Script: Migrate Notion pages to use HashID property
 * 
 * This script:
 * 1. Copies current Title (URL hash) to new HashID property
 * 2. Updates Title to first 10 characters of content text
 * 3. Clears the Content property (since content is stored in page body)
 * 
 * Prerequisites:
 * - Create HashID property (rich_text type) in Notion database first
 * - Set environment variables in .env file or shell: NOTION_TOKEN, NOTION_DATASOURCE_ID
 * 
 * Usage:
 *   node migrate-notion-hashid.js
 *   node migrate-notion-hashid.js --dry-run
 *   
 * Options:
 *   --dry-run    Preview changes without applying them
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load environment variables from .env file in script directory
 */
function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    
    if (!fs.existsSync(envPath)) {
        console.log('ℹ️ No .env file found in scripts directory, using shell environment variables');
        return;
    }
    
    console.log(`📄 Loading environment from ${envPath}`);
    
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
        // Skip comments and empty lines
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Parse KEY=VALUE format
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        // Only set if not already defined in shell environment
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

// Load .env file first
loadEnvFile();

const NOTION_API_VERSION = '2025-09-03';
const NOTION_API_BASE = 'https://api.notion.com/v1';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_DATASOURCE_ID = process.env.NOTION_DATASOURCE_ID;

const DRY_RUN = process.argv.includes('--dry-run');

if (!NOTION_TOKEN || !NOTION_DATASOURCE_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   NOTION_TOKEN and (NOTION_DATASOURCE_ID or NOTION_DATABASE_ID) must be set');
    process.exit(1);
}

console.log(`ℹ️ Config:`);
console.log(`   NOTION_DATABASE_ID: ${NOTION_DATABASE_ID || '(not set)'}`);
console.log(`   NOTION_DATASOURCE_ID: ${NOTION_DATASOURCE_ID}`);
console.log(`   Using ID: ${NOTION_DATASOURCE_ID}`);

/**
 * Truncate text to specified length
 */
function truncateText(text, maxLength = 10) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Make authenticated request to Notion API
 */
async function notionRequest(path, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_API_VERSION
        }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${NOTION_API_BASE}${path}`, options);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Notion API error: ${JSON.stringify(error)}`);
    }
    
    return response.json();
}

/**
 * Fetch all pages from the database
 */
async function fetchAllPages() {
    const pages = [];
    let cursor = undefined;
    
    console.log('📥 Fetching all pages from Notion...');
    console.log(`   Using Data Source ID: ${NOTION_DATASOURCE_ID}`);
    
    do {
        const response = await notionRequest(
            `/data_sources/${NOTION_DATASOURCE_ID}/query`,
            'POST',
            {
                page_size: 100,
                start_cursor: cursor
            }
        );
        
        pages.push(...response.results);
        cursor = response.has_more ? response.next_cursor : undefined;
        
        console.log(`   Fetched ${pages.length} pages so far...`);
    } while (cursor);
    
    console.log(`✅ Total pages fetched: ${pages.length}`);
    return pages;
}

/**
 * Fetch page blocks to get content from page body
 */
async function fetchPageBlocks(pageId) {
    try {
        const response = await notionRequest(`/blocks/${pageId}/children`);
        return response.results || [];
    } catch (e) {
        console.warn(`   ⚠️ Could not fetch blocks for page ${pageId}: ${e.message}`);
        return [];
    }
}

/**
 * Extract text content from blocks
 */
function extractTextFromBlocks(blocks) {
    const textParts = [];
    
    for (const block of blocks) {
        if (block.type === 'paragraph' && block.paragraph?.rich_text) {
            const text = block.paragraph.rich_text.map(t => t.plain_text).join('');
            if (text) textParts.push(text);
        }
    }
    
    return textParts.join('\n');
}

/**
 * Update a single page
 */
async function updatePage(pageId, properties) {
    return notionRequest(`/pages/${pageId}`, 'PATCH', { properties });
}

/**
 * Process and migrate a single page
 */
async function migratePage(page) {
    const pageId = page.id;
    const currentTitle = page.properties?.Title?.title?.[0]?.plain_text || '';
    const currentHashID = page.properties?.HashID?.rich_text?.[0]?.plain_text || '';
    const currentContent = page.properties?.Content?.rich_text?.map(t => t.plain_text).join('') || '';
    
    // Skip if HashID already exists (already migrated)
    if (currentHashID) {
        console.log(`   ⏭️ Page ${pageId.substring(0, 8)}... already has HashID, skipping`);
        return { skipped: true, reason: 'already_migrated' };
    }
    
    // Check if current title looks like a hash (64 hex characters)
    const isHash = /^[a-f0-9]{64}$/i.test(currentTitle);
    
    if (!isHash) {
        console.log(`   ⏭️ Page ${pageId.substring(0, 8)}... title is not a hash, skipping`);
        return { skipped: true, reason: 'not_hash_title' };
    }
    
    // Fetch page blocks to get content for new title
    const blocks = await fetchPageBlocks(pageId);
    const blockContent = extractTextFromBlocks(blocks);
    
    // Determine new title: use block content, fall back to Content property, then original hash
    const contentSource = blockContent || currentContent || currentTitle;
    const newTitle = truncateText(contentSource, 10);
    
    console.log(`   📝 Page ${pageId.substring(0, 8)}...`);
    console.log(`      Old Title (hash): ${currentTitle.substring(0, 20)}...`);
    console.log(`      New Title: "${newTitle}"`);
    console.log(`      HashID: ${currentTitle.substring(0, 20)}...`);
    
    if (DRY_RUN) {
        console.log(`      [DRY RUN] Would update page`);
        return { skipped: false, dryRun: true };
    }
    
    // Build update properties
    const updateProperties = {
        // Set HashID to the current title (URL hash)
        HashID: {
            rich_text: [{
                type: 'text',
                text: { content: currentTitle }
            }]
        },
        // Update Title to truncated content
        Title: {
            title: [{
                text: { content: newTitle }
            }]
        },
        // Clear Content property (set to empty)
        Content: {
            rich_text: []
        }
    };
    
    try {
        await updatePage(pageId, updateProperties);
        console.log(`      ✅ Updated successfully`);
        return { skipped: false, success: true };
    } catch (e) {
        console.error(`      ❌ Failed to update: ${e.message}`);
        return { skipped: false, success: false, error: e.message };
    }
}

/**
 * Main migration function
 */
async function migrate() {
    console.log('🚀 Starting Notion HashID Migration');
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    console.log('');
    
    try {
        // 1. Fetch all pages
        const pages = await fetchAllPages();
        
        if (pages.length === 0) {
            console.log('ℹ️ No pages found in database');
            return;
        }
        
        // 2. Process each page
        console.log('');
        console.log('🔄 Processing pages...');
        
        const stats = {
            total: pages.length,
            migrated: 0,
            skipped: 0,
            failed: 0
        };
        
        for (let i = 0; i < pages.length; i++) {
            console.log(`\n[${i + 1}/${pages.length}]`);
            const result = await migratePage(pages[i]);
            
            if (result.skipped) {
                stats.skipped++;
            } else if (result.success || result.dryRun) {
                stats.migrated++;
            } else {
                stats.failed++;
            }
            
            // Rate limiting: small delay between updates
            if (!DRY_RUN && !result.skipped) {
                await new Promise(resolve => setTimeout(resolve, 350));
            }
        }
        
        // 3. Print summary
        console.log('\n');
        console.log('═══════════════════════════════════════');
        console.log('📊 Migration Summary');
        console.log('═══════════════════════════════════════');
        console.log(`   Total pages: ${stats.total}`);
        console.log(`   Migrated:    ${stats.migrated} ${DRY_RUN ? '(would be)' : ''}`);
        console.log(`   Skipped:     ${stats.skipped}`);
        console.log(`   Failed:      ${stats.failed}`);
        console.log('═══════════════════════════════════════');
        
        if (DRY_RUN) {
            console.log('\n💡 Run without --dry-run to apply changes');
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
