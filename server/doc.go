package main

const DocHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Synapse Local Server - API Document</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #080c14;
            --bg-secondary: #0e1420;
            --bg-tertiary: #151e2e;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --primary: #6366f1;
            --primary-light: rgba(99, 102, 241, 0.15);
            --primary-hover: #4f46e5;
            --success: #10b981;
            --success-bg: rgba(16, 185, 129, 0.1);
            --warning: #f59e0b;
            --warning-bg: rgba(245, 158, 11, 0.1);
            --info: #06b6d4;
            --info-bg: rgba(6, 182, 212, 0.1);
            --border: #1e293b;
            --border-hover: #334155;
            --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
            --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--font-sans);
            background-color: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: var(--bg-primary);
        }
        ::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--text-muted);
        }

        /* Header */
        header {
            position: sticky;
            top: 0;
            z-index: 50;
            background-color: rgba(8, 12, 20, 0.8);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border);
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo-section {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .logo-icon {
            width: 2rem;
            height: 2rem;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            border-radius: 0.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            color: white;
            box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);
        }

        .logo-text {
            font-size: 1.25rem;
            font-weight: 700;
            letter-spacing: -0.025em;
            background: linear-gradient(to right, #f3f4f6, #9ca3af);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .header-meta {
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }

        .status-pill {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.375rem 0.75rem;
            border-radius: 9999px;
            background-color: var(--success-bg);
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: var(--success);
            font-size: 0.875rem;
            font-weight: 500;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background-color: var(--success);
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 8px var(--success);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
            }
            70% {
                transform: scale(1);
                box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
            }
            100% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
            }
        }

        /* Container Layout */
        .main-container {
            display: flex;
            flex: 1;
            height: calc(100vh - 4.5rem);
            overflow: hidden;
        }

        /* Sidebar */
        aside {
            width: 280px;
            border-right: 1px solid var(--border);
            background-color: var(--bg-secondary);
            padding: 1.5rem 1rem;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .sidebar-section-title {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 0.5rem;
            padding-left: 0.5rem;
        }

        .nav-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .nav-item-link {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
            border-radius: 0.375rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .nav-item-link:hover {
            color: var(--text-primary);
            background-color: rgba(255, 255, 255, 0.03);
        }

        .nav-item-link.active {
            color: white;
            background-color: var(--primary-light);
            border-left: 3px solid var(--primary);
        }

        .method-badge {
            font-size: 0.65rem;
            font-weight: 700;
            padding: 0.15rem 0.4rem;
            border-radius: 0.25rem;
            text-transform: uppercase;
            min-width: 48px;
            text-align: center;
            font-family: var(--font-mono);
        }

        .method-get {
            background-color: var(--success-bg);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .method-post {
            background-color: var(--warning-bg);
            color: var(--warning);
            border: 1px solid rgba(245, 158, 11, 0.2);
        }

        /* Main Content */
        main {
            flex: 1;
            padding: 2rem;
            overflow-y: auto;
            background-color: var(--bg-primary);
        }

        .content-width {
            max-width: 1000px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 3rem;
        }

        /* Overview Section */
        .overview-card {
            background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(14, 20, 32, 0.8) 100%);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            padding: 2rem;
            box-shadow: var(--shadow);
            position: relative;
            overflow: hidden;
        }

        .overview-card::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 200px;
            height: 200px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0) 70%);
            z-index: 0;
            pointer-events: none;
        }

        .overview-card h1 {
            font-size: 1.75rem;
            font-weight: 700;
            margin-bottom: 1rem;
            z-index: 1;
            position: relative;
        }

        .overview-card p {
            color: var(--text-secondary);
            font-size: 1rem;
            line-height: 1.6;
            margin-bottom: 1.5rem;
            max-width: 800px;
            z-index: 1;
            position: relative;
        }

        .server-meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            z-index: 1;
            position: relative;
        }

        .meta-box {
            background-color: rgba(8, 12, 20, 0.5);
            border: 1px solid var(--border);
            padding: 1rem;
            border-radius: 0.5rem;
        }

        .meta-box-label {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            margin-bottom: 0.25rem;
        }

        .meta-box-value {
            font-family: var(--font-mono);
            font-size: 0.95rem;
            font-weight: 500;
            word-break: break-all;
        }

        /* Section Title */
        .section-title {
            font-size: 1.25rem;
            font-weight: 700;
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.5rem;
            margin-top: 1rem;
            color: var(--text-primary);
        }

        /* API Card */
        .api-card {
            background-color: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            overflow: hidden;
            box-shadow: var(--shadow);
            transition: all 0.2s ease;
            scroll-margin-top: 5.5rem;
        }

        .api-card:hover {
            border-color: var(--border-hover);
        }

        .api-card-header {
            background-color: rgba(25, 35, 53, 0.3);
            border-bottom: 1px solid var(--border);
            padding: 1rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .api-card-title-group {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .api-card-path {
            font-family: var(--font-mono);
            font-size: 1.05rem;
            font-weight: 600;
        }

        .api-card-desc {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .auth-indicator {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 0.2rem 0.5rem;
            border-radius: 9999px;
        }

        .auth-none {
            background-color: rgba(16, 185, 129, 0.1);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .api-card-body {
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        /* Tables */
        .params-section-title {
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
        }

        .params-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
            text-align: left;
        }

        .params-table th, .params-table td {
            padding: 0.75rem;
            border-bottom: 1px solid var(--border);
        }

        .params-table th {
            color: var(--text-muted);
            font-weight: 600;
        }

        .param-name {
            font-family: var(--font-mono);
            font-weight: 600;
            color: #c084fc;
        }

        .param-type {
            font-family: var(--font-mono);
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .param-required {
            color: #f87171;
            font-weight: 500;
            font-size: 0.75rem;
        }

        .param-optional {
            color: var(--text-muted);
            font-size: 0.75rem;
        }

        /* Tabs and Code blocks */
        .playground-section {
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            overflow: hidden;
            background-color: var(--bg-tertiary);
        }

        .playground-header {
            background-color: rgba(8, 12, 20, 0.4);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 1.25rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .playground-title {
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .playground-actions {
            display: flex;
            gap: 0.5rem;
        }

        .btn {
            background-color: var(--primary);
            color: white;
            border: none;
            padding: 0.4rem 0.8rem;
            border-radius: 0.25rem;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s ease;
            display: flex;
            align-items: center;
            gap: 0.35rem;
        }

        .btn:hover {
            background-color: var(--primary-hover);
        }

        .btn-secondary {
            background-color: transparent;
            border: 1px solid var(--border);
            color: var(--text-secondary);
        }

        .btn-secondary:hover {
            background-color: rgba(255, 255, 255, 0.05);
            color: white;
            border-color: var(--text-muted);
        }

        .playground-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            min-height: 250px;
        }

        @media (max-width: 768px) {
            .playground-grid {
                grid-template-columns: 1fr;
            }
        }

        .playground-editor-col {
            border-right: 1px solid var(--border);
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .playground-response-col {
            padding: 1rem;
            display: flex;
            flex-direction: column;
            background-color: #05080f;
        }

        .col-title {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-muted);
            margin-bottom: 0.25rem;
        }

        .json-textarea {
            width: 100%;
            flex: 1;
            min-height: 200px;
            background-color: rgba(8, 12, 20, 0.6);
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.75rem;
            color: #38bdf8;
            font-family: var(--font-mono);
            font-size: 0.85rem;
            resize: vertical;
            outline: none;
        }

        .json-textarea:focus {
            border-color: var(--primary);
        }

        .url-input-field {
            width: 100%;
            background-color: rgba(8, 12, 20, 0.6);
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.5rem 0.75rem;
            color: var(--text-primary);
            font-family: var(--font-mono);
            font-size: 0.85rem;
            outline: none;
        }

        .url-input-field:focus {
            border-color: var(--primary);
        }

        .response-container {
            flex: 1;
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            background-color: rgba(8, 12, 20, 0.4);
            padding: 0.75rem;
            overflow: auto;
            position: relative;
            max-height: 400px;
        }

        .response-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-bottom: 0.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .response-status-badge {
            font-weight: 700;
            padding: 0.1rem 0.3rem;
            border-radius: 0.25rem;
        }

        .response-code-content {
            font-family: var(--font-mono);
            font-size: 0.825rem;
            white-space: pre-wrap;
            word-break: break-all;
            color: #a7f3d0;
        }

        .empty-response-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-muted);
            font-size: 0.875rem;
            text-align: center;
            padding: 2rem;
            flex-direction: column;
            gap: 0.5rem;
        }

        .empty-response-state svg {
            width: 2rem;
            height: 2rem;
            stroke: var(--text-muted);
        }

        /* SVG icons */
        .icon {
            display: inline-block;
            width: 1rem;
            height: 1rem;
            stroke-width: 2;
            stroke: currentColor;
            fill: none;
            stroke-linecap: round;
            stroke-linejoin: round;
            vertical-align: middle;
        }
    </style>
</head>
<body>

    <header>
        <div class="logo-section">
            <div class="logo-icon">S</div>
            <div class="logo-text">Synapse Server</div>
        </div>
        <div class="header-meta">
            <div class="status-pill">
                <span class="status-dot"></span>
                <span>Active</span>
            </div>

        </div>
    </header>

    <div class="main-container">
        <aside>
            <div>
                <h3 class="sidebar-section-title">General</h3>
                <ul class="nav-list">
                    <li><a href="#overview" class="nav-item-link active" onclick="activateNav(this)">Overview</a></li>
                </ul>
            </div>
            <div>
                <h3 class="sidebar-section-title">Endpoints</h3>
                <ul class="nav-list">
                    <li><a href="#endpoint-health" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-get">GET</span> <span style="font-family: var(--font-mono)">/health</span></a></li>
                    <li><a href="#endpoint-stats" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-get">GET</span> <span style="font-family: var(--font-mono)">/stats</span></a></li>
                    <li><a href="#endpoint-check" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-get">GET</span> <span style="font-family: var(--font-mono)">/check</span></a></li>
                    <li><a href="#endpoint-check-batch" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-post">POST</span> <span style="font-family: var(--font-mono)">/check/batch</span></a></li>
                    <li><a href="#endpoint-collect" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-post">POST</span> <span style="font-family: var(--font-mono)">/collect</span></a></li>
                    <li><a href="#endpoint-collect-batch" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-post">POST</span> <span style="font-family: var(--font-mono)">/collect/batch</span></a></li>
                    <li><a href="#endpoint-tasks-get" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-get">GET</span> <span style="font-family: var(--font-mono)">/tasks</span></a></li>
                    <li><a href="#endpoint-tasks-post" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-post">POST</span> <span style="font-family: var(--font-mono)">/tasks</span></a></li>
                    <li><a href="#endpoint-tasks-trigger" class="nav-item-link" onclick="activateNav(this)"><span class="method-badge method-get">GET</span> <span style="font-family: var(--font-mono)">/tasks/trigger</span></a></li>
                </ul>
            </div>
        </aside>

        <main>
            <div class="content-width">
                <!-- Overview Card -->
                <section id="overview" class="overview-card scroll-margin-top">
                    <h1>Synapse Local Daemon</h1>
                    <p>
                        A lightweight Go-based background server that collects bookmarks, status updates, and articles gathered from client Chrome Extensions (X, Bilibili, QZone). It digests payloads, manages an index cache, saves local image assets, and outputs well-structured Markdown files with rich YAML front matter ready for static generator compilation.
                    </p>
                    <div class="server-meta-grid">
                        <div class="meta-box">
                            <div class="meta-box-label">Base URL</div>
                            <div class="meta-box-value" id="meta-base-url">http://127.0.0.1:7070</div>
                        </div>
                        <div class="meta-box">
                            <div class="meta-box-label">Go Version Support</div>
                            <div class="meta-box-value">Go 1.22+</div>
                        </div>
                        <div class="meta-box">
                            <div class="meta-box-label">Storage Root</div>
                            <div class="meta-box-value" id="meta-storage-root">Scanning...</div>
                        </div>
                        <div class="meta-box">
                            <div class="meta-box-label">Cache Entries</div>
                            <div class="meta-box-value" id="meta-cache-size">Scanning...</div>
                        </div>
                    </div>
                </section>

                <h2 class="section-title">API Reference</h2>

                <!-- GET /health -->
                <section id="endpoint-health" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-get">GET</span>
                            <span class="api-card-path">/health</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Check the health, uptime, version, and general metadata of the Synapse daemon process.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="testEndpoint('GET', '/health', null, 'health')">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">Request Query / Headers</span>
                                    <p style="font-size: 0.8rem; color: var(--text-muted)">No parameters required.</p>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-health">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- GET /stats -->
                <section id="endpoint-stats" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-get">GET</span>
                            <span class="api-card-path">/stats</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Retrieve storage counters, active caches, and the designated filesystem root destination.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="testEndpoint('GET', '/stats', null, 'stats')">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">Request Headers</span>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-stats">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- GET /check -->
                <section id="endpoint-check" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-get">GET</span>
                            <span class="api-card-path">/check</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Check if a specific article or post has already been archived by querying its URL.</p>
                        
                        <div class="params-section-title">Query Parameters</div>
                        <table class="params-table">
                            <thead>
                                <tr>
                                    <th>Parameter</th>
                                    <th>Type</th>
                                    <th>Required</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="param-name">url</td>
                                    <td class="param-type">string</td>
                                    <td class="param-required">Yes</td>
                                    <td>The absolute url to search in the duplicate index.</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="runCheckEndpoint()">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">Query parameters</span>
                                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                        <label style="font-size: 0.75rem; color: var(--text-secondary)">url</label>
                                        <input type="text" id="check-query-url" class="url-input-field" value="https://x.com/jack/status/20">
                                    </div>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-check">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- POST /check/batch -->
                <section id="endpoint-check-batch" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-post">POST</span>
                            <span class="api-card-path">/check/batch</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Batch check multiple URLs at once to identify duplicates efficiently before scraping or collecting.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="runCheckBatchEndpoint()">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">JSON Body</span>
                                    <textarea id="check-batch-json" class="json-textarea">{
  "urls": [
    "https://x.com/jack/status/20",
    "https://x.com/another/status/12345"
  ]
}</textarea>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-check-batch">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- POST /collect -->
                <section id="endpoint-collect" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-post">POST</span>
                            <span class="api-card-path">/collect</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Submit a single scraped item containing Markdown body, authors, links, base64 images, tags, and timestamps. It saves images locally, generates local asset refs, and writes a rich front matter Markdown file.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="runCollectEndpoint()">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">JSON Body</span>
                                    <textarea id="collect-json" class="json-textarea">{
  "source": "X",
  "type": "text",
  "title": "Welcome to Synapse",
  "text": "Hello World! This is an elegant thought captured locally by Synapse.",
  "url": "https://x.com/synapse/status/1",
  "timestamp": "2026-05-21T11:15:00Z",
  "collectedAt": "2026-05-21T19:15:00+08:00",
  "author": {
    "username": "synapse_dev",
    "displayName": "Synapse Creator"
  },
  "tags": ["welcome", "local"],
  "images": [
    {
      "data": "",
      "mime_type": "image/png",
      "original_url": "https://via.placeholder.com/150"
    }
  ],
  "videos": [],
  "links": ["https://github.com/0xkamalei/synapse"]
}</textarea>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-collect">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- POST /collect/batch -->
                <section id="endpoint-collect-batch" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-post">POST</span>
                            <span class="api-card-path">/collect/batch</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Batch submit multiple scraped items to import them concurrently. Resolves success counts and duplicate conflict maps.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="runCollectBatchEndpoint()">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">JSON Body</span>
                                    <textarea id="collect-batch-json" class="json-textarea">{
  "items": [
    {
      "source": "Bilibili",
      "type": "video",
      "title": "Astro guide",
      "text": "A cool tutorial on Astro static builds.",
      "url": "https://www.bilibili.com/video/BV123456",
      "timestamp": "2026-05-21T11:20:00Z",
      "collectedAt": "2026-05-21T19:20:00+08:00",
      "author": {
        "username": "astro_expert",
        "displayName": "Astro Expert"
      },
      "tags": ["astro", "frontend"]
    }
  ]
}</textarea>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-collect-batch">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- GET /tasks -->
                <section id="endpoint-tasks-get" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-get">GET</span>
                            <span class="api-card-path">/tasks</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Retrieve currently scheduled, pending, or recently processed scraper queue URLs managed by the local scheduler.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="testEndpoint('GET', '/tasks', null, 'tasks-get')">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">Request Headers</span>

                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-tasks-get">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- POST /tasks -->
                <section id="endpoint-tasks-post" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-post">POST</span>
                            <span class="api-card-path">/tasks</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Publish and save a list of target queue scraper tasks to be processed by the scheduler engine.</p>
                        
                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="runSaveTasksEndpoint()">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">JSON Body</span>
                                    <textarea id="tasks-post-json" class="json-textarea">{
  "tasks": [
    {
      "url": "https://x.com/jack/status/20",
      "status": "pending",
      "added_at": "2026-05-21T19:25:00+08:00"
    }
  ]
}</textarea>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-tasks-post">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- GET /tasks/trigger -->
                <section id="endpoint-tasks-trigger" class="api-card">
                    <div class="api-card-header">
                        <div class="api-card-title-group">
                            <span class="method-badge method-get">GET</span>
                            <span class="api-card-path">/tasks/trigger</span>
                        </div>
                        <span class="auth-indicator auth-none">
                            <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            No Auth
                        </span>
                    </div>
                    <div class="api-card-body">
                        <p class="api-card-desc">Run all enabled scheduled tasks immediately. Each task URL is opened in Google Chrome.</p>

                        <div class="playground-section">
                            <div class="playground-header">
                                <span class="playground-title">Playground & Test</span>
                                <div class="playground-actions">
                                    <button class="btn" onclick="testEndpoint('GET', '/tasks/trigger', null, 'tasks-trigger')">
                                        <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run
                                    </button>
                                </div>
                            </div>
                            <div class="playground-grid">
                                <div class="playground-editor-col">
                                    <span class="col-title">Request Headers</span>
                                    <p style="font-size: 0.8rem; color: var(--text-muted)">No parameters required.</p>
                                </div>
                                <div class="playground-response-col">
                                    <span class="col-title">Response</span>
                                    <div class="response-container" id="response-tasks-trigger">
                                        <div class="empty-response-state">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            <span>Press "Run" to test this endpoint.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    </div>

    <script>
        // Setup initial UI states
        window.addEventListener('DOMContentLoaded', () => {
            // Set base URL dynamically
            const baseUrl = window.location.origin;
            document.getElementById('meta-base-url').innerText = baseUrl;

            // Fetch live metadata
            fetchStatsAndMeta();
        });

        function activateNav(linkEl) {
            document.querySelectorAll('.nav-item-link').forEach(el => el.classList.remove('active'));
            linkEl.classList.add('active');
        }

        async function fetchStatsAndMeta() {
            try {
                const res = await fetch('/health');
                if (res.ok) {
                    const healthData = await res.json();
                    document.getElementById('meta-storage-root').innerText = healthData.storage_root || 'N/A';
                    document.getElementById('meta-cache-size').innerText = healthData.cache_size !== undefined ? healthData.cache_size : 'N/A';
                }

                const statsRes = await fetch('/stats');
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    document.getElementById('meta-cache-size').innerText = statsData.cache_size;
                }
            } catch (err) {
                console.error('Failed to fetch server stats:', err);
            }
        }

        function renderResponse(containerId, status, statusText, headers, body) {
            const container = document.getElementById(containerId);
            const statusClass = status >= 200 && status < 300 ? 'method-get' : 'method-post';
            
            // Format headers
            let headerStr = '';
            for (let [key, value] of headers.entries()) {
                headerStr += key + ': ' + value + '\n';
            }

            // Format body if JSON
            let formattedBody = body;
            try {
                const parsed = JSON.parse(body);
                formattedBody = JSON.stringify(parsed, null, 2);
            } catch(e) {}

            container.innerHTML = 
                '<div class="response-meta">' +
                    '<span>Status: <strong class="response-status-badge ' + statusClass + '">' + status + ' ' + statusText + '</strong></span>' +
                '</div>' +
                '<div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 0.5rem; white-space: pre-wrap;">' + headerStr + '</div>' +
                '<pre class="response-code-content">' + escapeHtml(formattedBody) + '</pre>';
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        async function testEndpoint(method, path, body, responseContainerId) {
            const container = document.getElementById('response-' + responseContainerId);
            container.innerHTML = '<div class="empty-response-state">Sending request...</div>';
            
            const headers = {
                'Content-Type': 'application/json'
            };

            try {
                const options = { method, headers };
                if (body) {
                    options.body = typeof body === 'string' ? body : JSON.stringify(body);
                }

                const start = performance.now();
                const res = await fetch(path, options);
                const duration = (performance.now() - start).toFixed(1);
                
                const text = await res.text();
                renderResponse('response-' + responseContainerId, res.status, res.statusText, res.headers, text);
                
                // Refresh top stats after mutations
                if (method === 'POST' && res.ok) {
                    setTimeout(fetchStatsAndMeta, 500);
                }
            } catch (err) {
                container.innerHTML = 
                    '<div class="response-meta" style="color: var(--error)">' +
                        '<span>Failed to send request</span>' +
                    '</div>' +
                    '<pre style="color: var(--error); font-family: var(--font-mono); font-size: 0.825rem;">' + err.message + '</pre>';
            }
        }

        function runCheckEndpoint() {
            const urlVal = document.getElementById('check-query-url').value;
            testEndpoint('GET', '/check?url=' + encodeURIComponent(urlVal), null, 'check');
        }

        function runCheckBatchEndpoint() {
            const bodyVal = document.getElementById('check-batch-json').value;
            testEndpoint('POST', '/check/batch', bodyVal, 'check-batch');
        }

        function runCollectEndpoint() {
            const bodyVal = document.getElementById('collect-json').value;
            testEndpoint('POST', '/collect', bodyVal, 'collect');
        }

        function runCollectBatchEndpoint() {
            const bodyVal = document.getElementById('collect-batch-json').value;
            testEndpoint('POST', '/collect/batch', bodyVal, 'collect-batch');
        }

        function runSaveTasksEndpoint() {
            const bodyVal = document.getElementById('tasks-post-json').value;
            testEndpoint('POST', '/tasks', bodyVal, 'tasks-post');
        }
    </script>
</body>
</html>
`
