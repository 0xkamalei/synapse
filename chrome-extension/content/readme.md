# Content Collectors 实现指南

## 概述

Content Collectors 是 Chrome Extension 的内容脚本，负责从不同平台自动采集内容。每个平台有独立的 collector，遵循统一的架构模式。

## 核心流程

1. **配置检查** - 检查用户是否配置了该平台的目标用户
2. **目标验证** - 验证当前页面是否是目标用户的页面
3. **间隔检查** - 检查采集时间间隔，防止频繁采集
4. **页面加载** - 等待页面完全加载
5. **元素获取** - 获取页面中的内容元素
6. **内容解析** - 提取文本、图片、视频、元数据
7. **后台保存** - 发送到后台脚本保存到 Notion

## 统一配置架构

项目使用 **单一数据源（Single Source of Truth）** 来管理平台配置，避免重复定义和不一致问题。

### 核心配置文件：`lib/platforms.ts`

所有平台配置集中定义在这个文件中：

```typescript
export const PLATFORMS = {
    x: {
        toggle: 'enableX',           // UI 开关 ID
        config: 'configX',           // UI 配置区 ID
        targetInput: 'targetXUser',  // UI 输入框 ID
        configKey: 'targetXUser'     // AppConfig 字段名
    },
    // ... 其他平台
} as const;

export const DEFAULT_ENABLED_SOURCES: PlatformKey[] = ['x', 'bilibili', ...];
```

### 配置自动传播

- ✅ **lib/storage.ts** - 动态读取/保存所有平台配置
- ✅ **options/options.ts** - 动态生成 UI 元素访问器
- ✅ 添加新平台只需修改 `platforms.ts` 一处

## 添加新平台 Collector 的步骤

### 1. 准备工作

- 在目标网站保存 HTML 样本到 `target-html/platform.html`
- 分析 HTML 结构，确定关键 CSS 选择器

### 2. 更新平台配置（核心步骤）

#### 2.1 编辑 `lib/platforms.ts`

```typescript
export const PLATFORMS = {
    // ... 现有平台
    newplatform: {
        toggle: 'enableNewplatform',
        config: 'configNewplatform',
        targetInput: 'targetNewplatformUser',
        configKey: 'targetNewplatformUser' as const
    }
} as const;

// 添加到默认启用列表（可选）
export const DEFAULT_ENABLED_SOURCES: PlatformKey[] = [
    'x', 'bilibili', ..., 'newplatform'
];
```

#### 2.2 编辑 `lib/types.d.ts`

```typescript
interface CollectedContent {
  source: 'X' | 'Bilibili' | '...' | 'NewPlatform'; // 添加
}

interface AppConfig {
  targetNewplatformUser?: string; // 添加配置字段
  // 字段名必须与 platforms.ts 中的 configKey 一致！
}
```

### 3. 创建 Collector 文件

创建 `content/[platform]-collector.ts`

**参考文件**：

- 接口定义：[collector.interface.ts](collector.interface.ts)
- 实现示例：
  - [x-collector.ts](x-collector.ts) - 简单文本提取
  - [bilibili-collector.ts](bilibili-collector.ts) - 视频封面处理
  - [zsxq-collector.ts](zsxq-collector.ts) - 复杂 DOM 处理、表情/链接还原

**核心函数**（参考其他 collector）：

- `extractText*()` - 提取文本内容
- `extractImages*()` - 提取图片 URLs
- `extractTimestamp*()` - 解析时间戳
- `extractAuthor*()` - 提取作者信息
- `findAll*()` - 查找所有内容元素
- `collect*Data()` - 组装 CollectedContent 对象
- `isTargetURL*()` - 验证是否目标页面
- `tryAutoCollect*()` - 自动采集逻辑

### 4. 更新 manifest.json

```json
{
  "host_permissions": ["https://newplatform.com/*"],
  "content_scripts": [
    {
      "matches": ["https://newplatform.com/*"],
      "js": ["dist/content/platform-collector.js"]
    }
  ]
}
```

### 5. 更新 Options 页面 HTML

编辑 `options/options.html`，添加平台配置 UI：

```html
<div class="platform-item">
  <label>
    <input type="checkbox" id="enableNewplatform" class="platform-toggle" />
    NewPlatform
  </label>
  <div id="configNewplatform" class="platform-config hidden">
    <input type="text" id="targetNewplatformUser" placeholder="Target username" />
  </div>
</div>
```

**注意**：元素 ID 必须与 `platforms.ts` 中定义的完全一致！

### 6. ⚠️ 编写单元测试（必需）

#### 步骤 A: 更新测试文件

在 `content/collector.test.ts` 中：

1. 添加到 collectors 数组：

```typescript
const collectors = [
  // ... 其他
  'dist/content/platform-collector.js', // 添加
];
```

2. 添加测试用例（参考现有测试）：

```typescript
test('Platform Collector', () => {
  const htmlPath = join(TARGET_HTML_DIR, 'platform.html');
  const jsonPath = join(TARGET_HTML_DIR, 'platform.json');

  updateDOMWithUrl(htmlPath, 'https://platform.com/target');

  const items = (globalThis as any).findAllItemsPlatform();
  expect(items.length).toBeGreaterThan(0);

  const results = items.map((i: any) => (globalThis as any).collectItemDataPlatform(i));

  results.forEach((r: any) => {
    r.collectedAt = '2024-01-01T00:00:00.000Z';
  });

  if (!existsSync(jsonPath)) {
    writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`Created ${jsonPath}. Please review it.`);
  } else {
    const expected = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(results).toEqual(expected);
  }
});
```

#### 步骤 B: 运行测试

```bash
bun run build                  # 编译
bun run test                   # 首次运行生成 JSON
# 检查 target-html/platform.json 内容
bun run test                   # 再次运行验证一致性
```

## 架构优势总结

### ✅ 自动化处理

添加新平台后，以下组件会**自动**支持：

- **storage.ts** - 自动读取/保存新平台配置
- **options.ts** - 自动绑定 UI 元素和事件
- **默认配置** - 自动包含在 `DEFAULT_ENABLED_SOURCES`

### ✅ 一致性保证

- 平台标识符只在 `platforms.ts` 定义一次
- UI 元素 ID 与配置键的映射集中管理
- 避免了字符串拼写错误和不匹配问题

### ✅ 添加新平台清单

1. ✏️ 编辑 `lib/platforms.ts` - 添加平台配置
2. ✏️ 编辑 `lib/types.d.ts` - 添加 AppConfig 字段
3. ✏️ 编辑 `options/options.html` - 添加 UI 元素
4. ✏️ 创建 `content/platform-collector.ts` - 实现采集逻辑
5. ✏️ 编辑 `manifest.json` - 添加权限和内容脚本
6. ✅ 测试 - 验证配置保存和采集功能

**无需修改** storage.ts 和 options.ts 的业务逻辑！

## 常见问题排查

### 配置保存不成功

**症状**：配置后刷新页面，值丢失或 Toggle 状态不正确

**排查步骤**：

1. **检查 `platforms.ts` 配置**

   ```typescript
   // ✅ 正确
   zsxq: { ..., configKey: 'zsxqTargetGroup' as const }

   // ❌ 错误拼写
   zsxq: { ..., configKey: 'zsxqTargetGropu' as const }
   ```

2. **检查 `types.d.ts` 字段名**

   ```typescript
   // 必须与 platforms.ts 的 configKey 完全一致
   interface AppConfig {
     zsxqTargetGroup?: string; // ✅
     // zsxqGroup?: string;     // ❌ 不一致
   }
   ```

3. **检查 HTML 元素 ID**

   ```html
   <!-- ID 必须与 platforms.ts 的 toggle/config/targetInput 一致 -->
   <input id="enableZsxq" />
   <!-- ✅ 与 toggle 一致 -->
   <input id="targetZsxqGroup" />
   <!-- ✅ 与 targetInput 一致 -->
   ```

4. **验证配置存储**
   - 打开 Options 页面 → F12 控制台
   - 执行：`chrome.storage.sync.get(null, console.log)`
   - 检查保存的值是否正确

5. **检查编译**
   ```bash
   bun run build  # 确保最新代码已编译
   ```

### 自动采集不工作

1. 检查平台是否在 `DEFAULT_ENABLED_SOURCES` 中
2. 检查 collector 中使用的配置字段名是否正确
3. 检查 manifest.json 的 host_permissions 和 content_scripts
