import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    site: 'https://synapse.leix.dev',
    output: 'static',
    build: {
        assets: '_assets'
    }
});
