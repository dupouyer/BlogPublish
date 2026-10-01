# BlogPublish Agent 规范

本仓库管理技术博客的内容、站点源码和发布审阅。先读本文件，再按 [PUBLISHING.md](PUBLISHING.md) 执行。站点内的 `CLAUDE.md` 提供工程补充；内容与发布规则以这里和 `PUBLISHING.md` 为准。

## 仓库事实

| 用途 | 仓库根目录相对路径 |
| --- | --- |
| Astro 5 / Koharu 站点工程 | `Site/astro-koharu/` |
| 文章 | `Site/astro-koharu/src/content/blog/` |
| Frontmatter Schema | `Site/astro-koharu/src/content/config.ts` |
| 站点配置与分类映射 | `Site/astro-koharu/config/site.yaml` 的 `categoryMap` |
| 文章图片 | `Site/astro-koharu/public/img/posts/<slug>/` |
| 写作 Skill | `Site/astro-koharu/.claude/skills/blog-writer/SKILL.md` |

- 包管理器使用 pnpm；命令在站点工程目录运行。
- 日期按 `site.yaml` 的 `site.timezone`，当前为 `Asia/Shanghai`。
- 文章 URL 为 `/post/<link>`；没有 `link` 时使用 Astro 的内容 slug。更新旧文时保留原文件路径、`link` 和 `date`，增加或更新 `updated`。
- 以真实 Schema、配置和源码为准；主题文档与聊天中的旧建议可能过时。

## 内容任务

1. 搜索现有文章，判断更新还是新建。讨论同一问题的补充结论优先更新旧文。
2. 读取相关旧文、Schema、分类映射和 `blog-writer`；不要依赖固定的模板分类清单。
3. 把对话整理成可独立阅读的文章，交代适用版本、问题、原理、实现、验证和限制。
4. 区分源码事实、实测、推断和待验证内容。核对关键技术事实并引用官方文档、源码或论文；不要编造测试数据、跑通结果或来源。
5. 优先复用分类与标签。新增分类时，在同一 PR 中补齐 `categoryMap` 的唯一 slug；不要为了发一篇文章迁移已有分类或目录。
6. 默认创建 `post/<slug>` 分支；流程与规范调整用 `chore/<topic>`。保护工作区已有改动，只提交本次相关文件。
7. 按 `PUBLISHING.md` 验证、提交、推送并创建 PR，报告检查结果和真实可用的预览地址。

## Frontmatter 和资源

- 新文章使用小写英文短横线文件名和唯一 `link`，推荐 `.md`。使用 `.mdx` 前先确认工程已有相应集成。
- Schema 必填 `title`、`date`；发布规范还要求明确 `link`、`description`、`tags`、`categories`、`draft`，推荐 `catalog: true`。
- 层级分类使用 `categories: [[笔记, AI]]` 或等价 YAML；单层分类使用 `categories: [工具]`。不要写标量字符串，也不要把平铺数组误当层级路径。
- 分类路由来自 Frontmatter 和 `categoryMap`，不是文件夹；更深层分类必须逐项映射，细分主题优先用标签。常规文章保持一条主分类路径。
- 图片引用为 `/img/posts/<slug>/<filename>`，必须提交实际文件，提供有意义的 alt 文本。不要引用本地绝对路径、临时下载地址或 ChatGPT 文件链接。
- 保留文章中现有的资产路径，避免破坏旧文图片。未经请求，不批量生成摘要、相似文章向量或 LQIP 数据。

## 审阅和部署边界

- Cloudflare Pages 已接入 GitHub，生产分支为 `master`。现有构建执行 `cd Site/astro-koharu && pnpm install && pnpm run build`，输出为 `Site/astro-koharu/dist`；Dashboard 才是实际部署配置来源。
- Git 分支 / PR 是主要草稿机制。已可审阅的文章在分支上设置 `draft: false`，使 Cloudflare Preview 能展示它；未完成或需要合入后隐藏的文章才用 `draft: true`。
- `draft: true` 会被 `astro build` 过滤，包括 Cloudflare Preview。分支预览也可能公开访问，不要提交私人聊天、凭据或未经授权的素材。
- 依照用户授权完成分支、提交和 PR；默认让用户审阅后决定合并。用户明确授权合并或发布时再执行，先检查构建状态。
- 未经任务要求，不修改 Cloudflare Dashboard、部署脚本、`wrangler.jsonc`、目录结构、主题上游更新设置、锁文件、分析与评论服务，也不新增第二套部署入口。
- 本轮与常规写稿使用现有验证命令；不要假设存在 `pnpm verify` 或 GitHub 验证工作流。

## 完成标准

交付 PR 链接、文章或规范变更概要、实际验证结果。未运行或失败的检查必须明确说明；预览尚未生成时如实说明。不要把本地提交说成已推送，不要把 PR 说成已正式发布。
