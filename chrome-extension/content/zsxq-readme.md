
## 知识星球 (ZSXQ) 特别说明

### HTML 结构特点
知识星球使用 Angular 构建，DOM 结构中包含大量 Angular 特定属性（如 `_ngcontent-ng-*`）。

### 关键选择器
- 主题容器: `app-topic[type="flow"] .topic-container`
- 文本内容: `.talk-content-container .content`
- 图片画廊: `app-image-gallery .image-gallery-container img.item`
- 作者信息: `app-topic-header .role`
- 日期: `app-topic-header .date`
- 标签: `.talk-content-container .hashtag`, `app-tag-container .tag`

### "展开全部" 处理
知识星球的长文本会被折叠，显示"展开全部"按钮。Collector 通过直接读取 `.content` 元素的完整内容来获取全文，无需点击展开。

### 链接还原
知识星球中的外部链接通过 `<a class="link-of-topic">` 标签嵌入。Collector 会自动提取链接的 `href` 和显示文本，格式化为 `文本 (URL)` 形式。

### 表情符号处理
知识星球使用自定义表情图片，存储在 `<img class="emoji_local">` 中，通过 `data-title` 属性标识。Collector 会将表情转换为 `[表情名]` 文本格式。

### 配置参数
- `zsxqTargetGroup`: 目标星球的 Group ID（从 URL 中获取，如 `48415284844818`）
- `zsxqAutoCollect`: 是否启用自动采集（默认为 true）
## 知识星球 (ZSXQ) 特别说明

### HTML 结构特点
知识星球使用 Angular 构建，DOM 结构中包含大量 Angular 特定属性（如 `_ngcontent-ng-*`）。

### 关键选择器
- 主题容器: `app-topic[type="flow"] .topic-container`
- 文本内容: `.talk-content-container .content`
- 图片画廊: `app-image-gallery .image-gallery-container img.item`
- 作者信息: `app-topic-header .role`
- 日期: `app-topic-header .date`
- 标签: `.talk-content-container .hashtag`, `app-tag-container .tag`

### "展开全部" 处理
知识星球的长文本会被折叠，显示"展开全部"按钮。Collector 通过直接读取 `.content` 元素的完整内容来获取全文，无需点击展开。

### 链接还原
知识星球中的外部链接通过 `<a class="link-of-topic">` 标签嵌入。Collector 会自动提取链接的 `href` 和显示文本，格式化为 `文本 (URL)` 形式。

### 表情符号处理
知识星球使用自定义表情图片，存储在 `<img class="emoji_local">` 中，通过 `data-title` 属性标识。Collector 会将表情转换为 `[表情名]` 文本格式。

### 配置参数
- `zsxqTargetGroup`: 目标星球的 Group ID（从 URL 中获取，如 `48415284844818`）
- `zsxqAutoCollect`: 是否启用自动采集（默认为 true）