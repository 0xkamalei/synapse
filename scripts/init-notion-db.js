#!/usr/bin/env node

/**
 * Synapse - Notion Database Initialization Script
 * 
 * Creates the required database schema for Synapse in Notion.
 * 
 * Usage:
 *   node scripts/init-notion-db.js <parent_page_id>
 * 
 * Or with bun:
 *   bun scripts/init-notion-db.js <parent_page_id>
 * 
 * The parent_page_id is the ID of the Notion page where the database will be created.
 * You can find this in the page URL: https://www.notion.so/your-page-<PAGE_ID>
 */

import { Client } from '@notionhq/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const NOTION_TOKEN = process.env.NOTION_TOKEN;

if (!NOTION_TOKEN) {
    console.error('❌ Error: NOTION_TOKEN not found in .env file');
    process.exit(1);
}

const parentPageId = process.argv[2];

if (!parentPageId) {
    console.error('❌ Error: Parent page ID is required');
    console.error('');
    console.error('Usage: node scripts/init-notion-db.js <parent_page_id>');
    console.error('');
    console.error('Example:');
    console.error('  node scripts/init-notion-db.js abc123def456');
    console.error('');
    console.error('Find the page ID in your Notion page URL:');
    console.error('  https://www.notion.so/Your-Page-Title-<PAGE_ID>');
    process.exit(1);
}

// Clean up page ID (remove dashes if present)
const cleanPageId = parentPageId.replace(/-/g, '');

const notion = new Client({ auth: NOTION_TOKEN });

async function createDatabase() {
    console.log('🚀 Creating Synapse database in Notion...');
    console.log(`   Parent Page ID: ${cleanPageId}`);
    console.log('');

    try {
        const response = await notion.databases.create({
            parent: {
                type: 'page_id',
                page_id: cleanPageId
            },
            icon: {
                type: 'emoji',
                emoji: '⚡'
            },
            title: [
                {
                    type: 'text',
                    text: {
                        content: 'Synapse Thoughts'
                    }
                }
            ],
            properties: {
                // Title - Primary column
                Title: {
                    title: {}
                },

                // Content - Full text content
                Content: {
                    rich_text: {}
                },

                // Source - Platform origin
                Source: {
                    select: {
                        options: [
                            { name: 'X', color: 'blue' },
                            { name: 'Bilibili', color: 'pink' },
                            { name: 'Manual', color: 'gray' }
                        ]
                    }
                },

                // OriginalURL - Link to original post
                OriginalURL: {
                    url: {}
                },

                // OriginalDate - When the post was published
                OriginalDate: {
                    date: {}
                },

                // Tags - Multi-select tags
                Tags: {
                    multi_select: {
                        options: [
                            { name: '技术', color: 'blue' },
                            { name: '独立开发', color: 'green' },
                            { name: '生活', color: 'yellow' },
                            { name: '思考', color: 'purple' }
                        ]
                    }
                },

                // Status - Publication status
                Status: {
                    select: {
                        options: [
                            { name: 'Published', color: 'green' },
                            { name: 'Draft', color: 'yellow' },
                            { name: 'Archived', color: 'gray' }
                        ]
                    }
                },

                // CollectedAt - Auto-generated creation time
                CollectedAt: {
                    created_time: {}
                }
            }
        });

        console.log('✅ Database created successfully!');
        console.log('');
        console.log('📋 Database Details:');
        console.log(`   ID: ${response.id}`);
        console.log(`   URL: ${response.url}`);
        console.log('');
        console.log('📝 Next steps:');
        console.log('   1. Add the database ID to your .env file:');
        console.log(`      NOTION_DATABASE_ID=${response.id}`);
        console.log('');
        console.log('   2. Configure the Chrome extension with this database ID');
        console.log('');
        console.log('   3. Copy to website/.env as well:');
        console.log(`      NOTION_DATABASE_ID=${response.id}`);

        return response;

    } catch (error) {
        if (error.code === 'object_not_found') {
            console.error('❌ Error: Page not found or not accessible');
            console.error('');
            console.error('Make sure:');
            console.error('  1. The page ID is correct');
            console.error('  2. You have shared the page with your Notion integration');
            console.error('     (Click "..." menu > "Add connections" > select your integration)');
        } else if (error.code === 'unauthorized') {
            console.error('❌ Error: Invalid Notion token');
            console.error('');
            console.error('Check your NOTION_TOKEN in the .env file');
        } else {
            console.error('❌ Error creating database:', error.message);
            if (error.body) {
                console.error('   Details:', JSON.stringify(error.body, null, 2));
            }
        }
        process.exit(1);
    }
}

createDatabase();
