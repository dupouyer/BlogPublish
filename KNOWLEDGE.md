# 系列与专题

站点保留四种入口：最近更新按日期浏览，`/series/` 按学习顺序浏览，`/collections/` 按问题浏览，分类与标签用于检索。周报原有 `/weekly` 与订阅保持独立。

## 添加文章

系列／专题的标题、介绍和阶段在 `Site/astro-koharu/src/lib/knowledge-config.ts` 中维护一次。文章归属、顺序、前置阅读在 Frontmatter 声明；页面、文章上下文导航和卡片由公开文章自动生成，无需手动维护文章目录。

```yaml
series:
  id: linear-algebra-for-ta
  order: 3
  stage: coordinates
collection: [normal-mapping]
prerequisites: [dot-cross-linear-algebra]
interactive: true
difficulty: 进阶
readingMinutes: 12
```

- `series` 可选，`order` 是系列内唯一正整数，独立于发布日期；`stage` 必须存在于该系列配置中。
- `collection` 可选，可归属多个专题；与主分类无关。
- `prerequisites` 引用文章的 `link`，没有 `link` 时使用内容 ID。应引用已发布文章，不引用规划标题。构建会检查重复系列序号、无效引用和循环依赖。
- `interactive` 可选；未声明时从正文的 article-lab 指令／iframe 推导。交互数量只统计实际嵌入的演示。
- `learningOutcome` 可选，描述本文建立的具体理解，用于正文底部的继续学习提示。
- `difficulty` 可选：入门／进阶／深入。`readingMinutes` 可选，未声明时从正文估算，页面标注“约”。
- 草稿不会进入生产目录、计数和导航；更新已有文章时保留文件、`link` 与初始 `date`。
- `planned` 只用于系列阶段／专题问题的阅读地图；呈现为“计划中”的静态条目，不生成文章链接，也不计入已发布文章数量。玻璃专题目前处于此状态，另提供已发布的相关基础文章。

当前线代系列复用完整的 Dot/Cross 总览作为 01、法线镜像工程案例作为 02，没有拆分或改写正文。专题接入法线、植被和 Agent 相关既有文章。

## 验证

按 `PUBLISHING.md` 运行内容、类型、代码检查与构建。纯数据测试：

```bash
cd Site/astro-koharu
node --import tsx --test src/lib/knowledge.test.ts
```

网页审阅包含：首页入口、系列/专题总览和详情、文章顶部当前位置与前置链接、底部前后篇及专题跳转、移动屏幕、浅色/暗色主题、无 JavaScript 的静态链接。检查 `/post/getting-started` 已删除，现有文章链接保持可用。
