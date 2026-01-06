# Synapse

> 零成本个人 Thoughts 聚合平台

Synapse 是一个将分散在 X.com、B站等平台的个人内容聚合到统一平台的系统。

## 项目结构

```
synapse/
├── chrome-extension/    # Chrome 扩展 - 内容采集
├── website/             # Astro 静态站 - 内容展示
└── .github/workflows/   # GitHub Actions - 自动构建
```

## 快速开始

### 1. 准备工作

#### Notion 数据库
1. 创建 Notion Database，包含以下字段：
   - Title (Title)
   - Content (Rich Text)
   - Source (Select: X / Bilibili / Manual)
   - OriginalURL (URL)
   - OriginalDate (Date)
   - Tags (Multi-select)
   - Status (Select: Published / Draft / Archived)

2. 创建 [Notion Integration](https://www.notion.so/my-integrations) 并获取 Token
3. 将 Integration 分享到你的 Database

#### GitHub 图床
1. 创建 **公开** 仓库 (如 `synapse-images`)
2. 创建 [Personal Access Token](https://github.com/settings/tokens) (需要 `repo` 权限)

### 2. 安装 Chrome 扩展

```bash
cd chrome-extension
# 在 Chrome 中加载未打包的扩展
```

详见 [chrome-extension/README.md](./chrome-extension/README.md)

### 3. 运行网站

```bash
cd website
bun install
cp .env.example .env
# 编辑 .env 填入 Notion credentials
bun run dev
```

详见 [website/README.md](./website/README.md)

## 技术栈

| 组件 | 技术 |
|------|------|
| Chrome 扩展 | Manifest V3, ES Modules |
| 图床 | GitHub API + jsDelivr CDN |
| 存储 | Notion API |
| 网站 | Astro, TypeScript |
| 样式 | Material Design 3 |
| 构建 | bun |

## 工作流

1. **采集**: 使用 Chrome 扩展从 X.com/B站 采集内容
2. **存储**: 图片上传到 GitHub，内容保存到 Notion
3. **构建**: 本地或 GitHub Actions 构建 Astro 静态站
4. **部署**: 部署到 Firebase / Vercel / GitHub Pages

## License

MIT
