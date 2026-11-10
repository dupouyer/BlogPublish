# 访客统计部署（Cloudflare Pages + D1）

本项目保持 **Astro 静态构建**。Cloudflare Pages 根目录为仓库根目录（见 PUBLISHING.md），所以 Functions 入口位于根目录的 `functions/api/visits.ts`，而不是站点工程内。访客数据显示在全站页脚，文章阅读量显示在文章底部。

## 首次启用（需要 Cloudflare Dashboard 权限）

1. 在 Cloudflare D1 创建数据库，例如 `blogpublish-visitors`。
2. 在 Cloudflare Pages 对应项目 **Settings → Bindings → D1 database bindings** 中绑定数据库，变量名必须为 `VISITOR_DB`。生产和预览环境按需要分别绑定（推荐预览使用独立数据库，避免测试访问污染正式统计）。
3. 使用 Wrangler 执行根目录 `migrations/0001_visitors.sql`，例如在仓库根目录执行：
   `pnpm --dir Site/astro-koharu exec wrangler d1 execute blogpublish-visitors --remote --file=migrations/0001_visitors.sql`
   若 Wrangler 实际工作目录在站点工程内，可使用绝对路径指向 SQL 文件，或在 Cloudflare D1 控制台执行 SQL。务必确认登录的账号与目标数据库。
4. 重新部署 Pages 项目，然后访问网站，检查 `GET /api/visits?path=/` 是否返回 `pv`、`uv` 和 `postPv`。绑定或初始化缺失时 API 返回 503，UI 保持“—”，不显示虚假的 0。

## 统计口径

- **PV**：一个真实浏览器每个页面访问事件；同一访客同一路径 60 秒内重复访问不重复计算。全站累计 PV 包括各个页面，而文章 PV 仅统计 `/post/...`。
- **UV**：浏览器本地随机 UUID 的站点生命周期去重（服务端仅保存 SHA-256 摘要），不是精确自然人数。同一人更换设备、清空存储或无痕模式会被识别为新访客。
- 客户端只在页面加载/客户端导航时发送同源请求，不记录 IP、Cookie、Referrer，不使用第三方统计脚本。基础 User-Agent 机器人过滤不能完全阻止伪造请求或自动化流量。
- D1 永久保存计数及去重摘要；目前没有管理端或统计回溯，历史访问不会自动补录。清除数据库会清零。大量访客时应评估保留周期/聚合归档和成本。
- 当前使用脚本加载统计；JavaScript 被阻止时不计数。

## 检查

- 确保 Cloudflare Pages 已启用 Functions、D1 已绑定且 SQL 已执行。PR Preview 如果未配置 D1 会显示“—”。
- `GET /api/visits?path=/` 不增加 PV；页面加载时 POST 增加 PV。
- 60 秒内重复访问同一路径 PV 不变；另一篇文章 PV 单独增加；同一浏览器站点 UV 不重复增加。
- Astro ClientRouter 的客户端导航应触发文章统计更新。
