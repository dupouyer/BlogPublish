# 技术博客发布流程

`dupouyer/BlogPublish` 保存知识资产和审阅历史；Cloudflare Pages 执行现有构建和部署。

## 当前发布入口

| 配置 | 当前值 |
| --- | --- |
| GitHub 仓库 | `dupouyer/BlogPublish` |
| 生产分支 | `master` |
| Cloudflare 根目录 | 仓库根目录，Dashboard 中为空 |
| 构建命令 | `cd Site/astro-koharu && pnpm install && pnpm run build` |
| 构建输出目录 | `Site/astro-koharu/dist` |
| 正式站点 | `https://blog.pandaroux.cn` |

以上记录来自当前仓库和用户提供的 Cloudflare 配置。本文件不设置 Dashboard；调整部署时需同时核对实际配置。保留 Cloudflare Git 集成作为部署入口。非生产分支的预览是否触发，以 Cloudflare 的分支控制和构建状态为准，不承诺每个 PR 一定产生预览。

## 从技术对话到文章

1. 在 `Site/astro-koharu/src/content/blog/` 搜索关键词和相关代码概念，读取可能重复的文章。
2. 同一问题的新证据、纠错或实现细节更新旧文；独立主题新建文章，并给相关旧文加链接。
3. 从最新 `master` 创建 `post/<slug>` 分支；规范调整使用 `chore/<topic>`。已有工作区先检查状态，不覆盖用户改动。
4. 读取 `AGENTS.md`、实际 Schema、分类映射及 `blog-writer`，写成读者无需看聊天即可理解的技术文章。
5. 核对引擎 / 工具版本、公式、坐标空间、单位、代码输入输出和关键来源。实测数据说明场景和硬件；未测试的代码明确标为示例。
6. 提交文章和图片，执行下方验证，推送分支并创建目标为 `master` 的 PR。
7. 在 GitHub 检查 Cloudflare 状态和对应提交的 Preview，审阅网页后再合并。
8. 合并后检查 Cloudflare 正式构建状态和正式文章地址，再确认发布完成。

## Frontmatter

新文章示例，日期替换为实际写作日期，使用站点时区：

```yaml
---
title: "如何验证 Agent 工作流的执行结果"
link: verify-agent-workflow-results
catalog: true
date: "2026-10-01 17:00:00"
description: "通过可重复的检查区分 Agent 的执行结果与推断，并把验证结果接入审阅流程。"
tags:
  - AI Agent
  - Codex
categories:
  - [笔记, AI]
draft: false
---
```

- Schema 位于 `Site/astro-koharu/src/content.config.ts`，当前仅 `title` 和 `date` 必填；以上更完整字段是本仓库的写作要求。
- 单层分类写成 `categories: [工具]`；`categories: 随笔` 不符合当前 Schema。
- `categories: [笔记, AI]` 不等同于嵌套路径；层级写成 `categories: [[笔记, AI]]`。通常只使用一条主路径，跨主题信息写到 `tags`。
- 新文章文件名为 `<link>.md`，检查 `link` 不与其他文章的实际路由冲突。文章地址是 `/post/<link>`，不由分类目录决定。
- 更新旧文保留原来的文件路径、`link` 和 `date`，设置 `updated: "YYYY-MM-DD HH:mm:ss"`。不要把更新时间覆盖成首次发布日期。
- 日期可以使用带偏移的 ISO 格式；无偏移日期按 `site.timezone` 解析，当前为 `Asia/Shanghai`。

### 草稿与预览

| 状态 | `draft` | 效果 |
| --- | --- | --- |
| 文章已完整，放在 PR 分支待审阅 | `false` | 可进入分支的 Cloudflare Preview；合并后进入正式构建 |
| 内容未完成或需合入后隐藏 | `true` | 从生产构建中过滤，Cloudflare Preview 也看不到；可在 `pnpm dev` 查看 |

PR 草稿状态只表示审阅状态，不等于文章的 `draft` 字段。分支中的 `draft: false` 尚未进入生产分支，但预览页面可能公开。私人信息不能依赖分支或 `draft` 字段来保密。

## 分类与标签

分类映射以 `Site/astro-koharu/config/site.yaml` 的 `categoryMap` 为准。当前主要分类为 `笔记`、`工具`、`随笔`、`周刊`；技术文章已有 `AI`、`Unity`、`Blender`、`算法` 等映射。

- 当前示例：`[笔记, AI]` → `/categories/note/ai`，文件可放在 `src/content/blog/note/ai/`。
- 文件夹用于组织源码；Frontmatter 决定分类，`categoryMap` 决定分类 URL。
- 不把三级分类自动折叠成标签：当前源码逐层生成分类路径。常规文章优先两层，`PBR`、`Vegetation`、`Rendering` 等细分主题可以用标签。
- 没有合适分类时，在文章 PR 中新增语义清楚的映射，例如 `Unreal Engine: unreal-engine`，保持 slug 唯一；同时创建匹配的文章目录。不要移动旧文或更改已有 slug 来配合新文。
- 标签复用现有拼写，避免 `UE` / `UE5` / `Unreal Engine` 等同义标签无计划扩散。原有标签保留，新文先查看已有用法。

## 图片、代码和图表

- 新资源默认放在 `Site/astro-koharu/public/img/posts/<slug>/`，正文和 `cover` 使用 `/img/posts/<slug>/<filename>`。
- 提交实际图片，压缩到适合网页的尺寸；alt 描述图片表达的内容。沿用旧文资产时保留原路径。
- 使用 Markdown 代码围栏并标注语言。引擎代码说明适用版本、依赖、输入输出、单位和坐标空间，示例和已实测实现分开表述。
- 关系或流程适合 Mermaid，精确数值适合表格；图表不能编造性能提升。信息图语法参照已有文章或相关 Skill，不把聊天中的组件标签直接粘贴进博客。
- 引用使用稳定的原文 URL；不能使用 ChatGPT 的内部引用标记、临时文件地址或本地绝对路径。

## 提交前验证

Astro 6 要求 Node >= 22.12.0；仓库和站点的 `.nvmrc` 固定 Node 22.23.3，根目录和站点的 `package.json` 固定 pnpm 9.15.1。根目录 manifest 仅用于让 Cloudflare 在安装指定 Node 后识别并安装 pnpm，不定义另一套构建入口。Cloudflare 保留现有构建命令，使用仓库根目录的 `.nvmrc` 选择 Node。

所有站点命令从 `Site/astro-koharu/` 执行，使用现有脚本：

```bash
cd Site/astro-koharu
pnpm install --frozen-lockfile
pnpm lint-md
pnpm check
pnpm build
```

`pnpm install --frozen-lockfile` 是本地检查，不修改 Cloudflare 当前的安装命令或锁文件。当前环境安装失败时保留实际原因，不悄悄改成更新依赖来绕过它。

| 变更范围 | 检查 |
| --- | --- |
| 仅根目录规范 / Skill 文档 | 检查 Markdown、文档链接、路径、示例与 Schema / 配置 / 脚本的一致性；`git diff --check`。无须完整站点构建 |
| 文章 / 图片 / 分类 | 上述站点检查；本地链接和图片存在；目标文章、分类页、目录、公式和代码块预览 |
| 站点代码 / 构建配置 | 上述站点检查，加 `pnpm lint`，再运行与改动相关的已有测试 |

现有 `pnpm lint-md` 检查内容目录，不覆盖根目录规范或 Skill。使用 Markdown CLI 定向检查改动的文档；不要对整个仓库运行自动修复来顺带格式化其他文件。

当前没有 `pnpm verify` 统一入口或仓库级验证 Workflow，PR 创建不会自动添加它们。遇到全量 lint / typecheck 的历史失败，记录命令、错误和与本次变更的关系，不宣称检查通过；本次引入的问题必须修复。

## PR 与网页审阅

PR 描述包含问题、最终改动、检查结果和未完成检查。文章 PR 同时列出目标文章路径、公开 URL 路径、分类、`draft` 状态和关键来源。

Cloudflare Preview 可用时填写真实 URL，确认它对应 PR 最新提交；尚未生成或预览被分支设置禁用时说明状态，不猜测链接。审阅文章正文、图片、TOC、代码、Mermaid / 公式、分类导航、内链和手机布局。

默认由用户审阅和合并；明确授权自动合并时，仍先核对当前提交的检查状态。合并进入 `master` 会触发现有生产发布流程，发布完成需要成功构建和正式站点验证。失败时先查看 Cloudflare 日志，修复后走新的提交；不临时新增另一套部署方式。

## 后续整理

站点已统一使用 `pnpm-lock.yaml`，不再维护 npm 锁文件。整理个人站点模板配置、扩充 TA 分类、增加验证入口和 PR 检查，可以分别作为后续变更。Cloudflare 的 Build Watch Path、缓存、Root directory 优化需根据实际 Dashboard 配置实施；当前阶段保持原值。
