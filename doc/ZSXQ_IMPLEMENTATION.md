# 知识星球 (ZSXQ) Collector 实现总结

## 完成的工作

### 1. 创建核心 Collector 文件
✅ **文件**: [chrome-extension/content/zsxq-collector.ts](chrome-extension/content/zsxq-collector.ts)

**功能实现**:
- ✅ 文本内容提取，包含递归处理所有节点
- ✅ 表情符号处理（将图片转换为 `[表情名]` 格式）
- ✅ 外部链接还原（格式化为 `文本 (URL)` ）
- ✅ Hashtag 标签提取（从内容和标签容器）
- ✅ 图片提取（从 image-gallery 组件）
- ✅ 时间戳解析（从 header date 元素）
- ✅ 作者信息提取
- ✅ 目标星球验证（基于 Group ID）
- ✅ 自动采集功能
- ✅ URL 变化监听（SPA 导航支持）

### 2. 更新配置文件

✅ **manifest.json**
- 添加了 `https://wx.zsxq.com/*` 和 `https://*.zsxq.com/*` 的 host_permissions
- 添加了 content_scripts 配置以在知识星球页面注入 collector
- 更新了扩展描述，包含 ZSXQ

✅ **options.html**
- 添加了知识星球平台配置卡片
- 包含 Group ID 输入框和开关
- 添加了配置提示（从 URL 中获取 Group ID）

✅ **options.ts**
- 在 PLATFORMS 常量中添加了 zsxq 配置
- 添加了 DOM 元素引用（enableZsxq, configZsxq, targetZsxqGroup）
- 更新了 loadConfig 和 handleSave 函数以处理 zsxq 配置

✅ **types.d.ts**
- CollectedContent source 类型添加了 'ZSXQ'
- AppConfig 接口添加了 zsxqTargetGroup 和 zsxqAutoCollect 属性
- CollectedContent 添加了可选的 hashtags 字段
- 将 type 和 links 设为可选（因为不是所有平台都需要）

✅ **README.md**
- 更新了扩展描述，包含 ZSXQ
- 更新了 Notion 数据库设置说明

✅ **content/readme.md**
- 添加了知识星球特别说明部分
- 说明了 HTML 结构特点、关键选择器、特殊处理逻辑

## 技术要点

### DOM 选择器策略
知识星球使用 Angular 框架，DOM 结构复杂但有规律：
```typescript
// 主题容器
'app-topic[type="flow"] .topic-container'

// 文本内容
'.talk-content-container .content'

// 图片
'app-image-gallery .image-gallery-container img.item'

// 作者
'app-topic-header .role'

// 时间
'app-topic-header .date'
```

### 特殊处理

**1. "展开全部" 按钮**
- 不需要点击，直接读取完整的 `.content` 元素
- 使用递归遍历所有子节点获取完整文本

**2. 链接还原**
```typescript
// 识别 class="link-of-topic" 的链接
// 提取 href 和 linkText
// 格式化为: "文本 (URL)"
```

**3. 表情处理**
```typescript
// 识别 .emoji_span img
// 读取 data-title 或 title 属性
// 转换为: "[表情名]"
```

**4. Hashtag 提取**
```typescript
// 从两个位置提取：
// 1. .talk-content-container .hashtag
// 2. app-tag-container .tag
```

## 测试建议

### 手动测试步骤

1. **安装扩展**
   ```bash
   cd chrome-extension
   npm run build
   ```
   在 Chrome 扩展页面加载 unpacked extension

2. **配置扩展**
   - 打开扩展 Options 页面
   - 配置 Notion 和 GitHub 信息
   - 启用知识星球开关
   - 输入目标 Group ID（例如：48415284844818）

3. **访问目标星球**
   - 打开 https://wx.zsxq.com/group/48415284844818
   - 检查 Console 日志：`[Synapse ZSXQ] Content script loaded`
   - 应该看到自动采集日志

4. **验证采集结果**
   - 检查 Console 是否显示采集成功
   - 查看 Notion 数据库是否有新记录
   - 验证以下内容：
     - ✅ 文本内容完整（包含链接和表情）
     - ✅ 图片正确上传到 GitHub
     - ✅ 时间戳正确
     - ✅ 作者信息正确
     - ✅ Hashtag 标签提取正确

### 调试技巧

1. **启用 Debug Mode**
   - 在 Options 页面开启 Debug Mode
   - 采集时会输出 JSON 但不保存到 Notion
   - 便于验证数据提取是否正确

2. **查看日志**
   ```javascript
   // 在页面 Console 中查看
   // [Synapse ZSXQ] 开头的所有日志
   ```

3. **检查 HTML 结构**
   - 使用 DevTools Elements 面板
   - 检查实际的 DOM 结构是否与 target-html/zsxq.html 一致
   - 如有变化，需要更新选择器

## 下一步建议

1. **优化采集间隔**
   - 当前使用全局的 collectIntervalHours
   - 可考虑为每个平台单独设置间隔

2. **增加错误处理**
   - 添加更详细的错误日志
   - 处理网络请求失败的情况

3. **支持更多内容类型**
   - 当前主要支持文本和图片
   - 可以扩展支持视频、文件等

4. **UI 反馈优化**
   - 在页面上显示采集状态提示
   - 添加手动采集按钮（通过 content menu 或页面按钮）

## 文件清单

### 新增文件
- `chrome-extension/content/zsxq-collector.ts`

### 修改文件
- `chrome-extension/manifest.json`
- `chrome-extension/options/options.html`
- `chrome-extension/options/options.ts`
- `chrome-extension/lib/types.d.ts`
- `chrome-extension/README.md`
- `chrome-extension/content/readme.md`

### 编译产物
- `chrome-extension/dist/content/zsxq-collector.js` (TypeScript 编译后)

---

## 快速开始

```bash
# 1. 编译代码
cd chrome-extension
npm run build

# 2. 在 Chrome 中加载扩展
# chrome://extensions/ -> Load unpacked -> 选择 chrome-extension 文件夹

# 3. 配置扩展
# 点击扩展图标 -> Settings
# 配置 Notion、GitHub 和知识星球 Group ID

# 4. 访问目标星球页面进行测试
# https://wx.zsxq.com/group/[你的GroupID]
```

完成！🎉
