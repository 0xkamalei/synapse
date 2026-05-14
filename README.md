# Synapse

> 零成本个人 Thoughts 聚合平台

Synapse 是一个将分散在 X.com、B站等平台的个人内容聚合到本地 Markdown 数据库并展示到网站的系统。

## 项目结构

```
synapse/
├── chrome-extension/    # Chrome 扩展 - 内容采集
├── server/              # 本地服务 - 接收采集内容并写入 Markdown
├── website/             # Astro 静态站 - 内容展示
└── .github/workflows/   # GitHub Actions - 自动构建
```

## 快速开始

### 1. 准备工作

#### 本地服务

```bash
cd server
go build -o synapse-server .
./synapse-server --token mysecret --storage-root /Users/lei/synapse-data
```

详见 [server/SPEC.md](./server/SPEC.md)。

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
bun run dev
```

详见 [website/README.md](./website/README.md)

## 技术栈

| 组件 | 技术 |
|------|------|
| Chrome 扩展 | Manifest V3, ES Modules |
| 本地服务 | Go HTTP Server |
| 存储 | Markdown + YAML Front Matter |
| 网站 | Astro, TypeScript |
| 样式 | Material Design 3 |
| 构建 | bun |

## 工作流

1. **采集**: 使用 Chrome 扩展从 X.com/B站 采集内容
2. **存储**: 扩展把内容推送到本地服务，图片由本地服务写入磁盘
3. **构建**: 本地或 GitHub Actions 构建 Astro 静态站
4. **部署**: 部署到 Firebase / Vercel / GitHub Pages

## License

MIT
