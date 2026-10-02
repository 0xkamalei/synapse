# Synapse Website

> Static website for displaying aggregated thoughts

## Features

- 📊 **Heatmap** - GitHub-style contribution graph
- 📅 **Calendar View** - Browse thoughts by date
- 🎨 **Material Design** - Clean, modern UI
- ⚡ **Static Site** - Fast loading, SEO friendly

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Notion credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 3. Development

```bash
bun run dev
```

Open http://localhost:4321

### 4. Build

```bash
bun run build
```

Output will be in `./dist`

### 5. Preview Build

```bash
bun run preview
```

## Deployment

### Vercel

```bash
# Install Vercel CLI
bun add -g vercel

# Deploy
vercel --prod
```

### GitHub Pages

Use GitHub Actions. See `.github/workflows/build.yml` in the root directory.

## Project Structure

```
website/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── layouts/
    │   └── BaseLayout.astro
    ├── components/
    │   ├── ThoughtCard.astro
    │   ├── Heatmap.astro
    │   └── Calendar.astro
    ├── pages/
    │   ├── index.astro
    │   └── calendar.astro
    ├── styles/
    │   └── global.css
    └── lib/
        └── notion.ts
```

## Customization

### Colors

Edit CSS variables in `src/styles/global.css`:

```css
:root {
  --md-primary: #6750A4;
  /* ... */
}
```

### Site Title

Edit `src/layouts/BaseLayout.astro`:

```html
<title>{title} | Your Site Name</title>
```
