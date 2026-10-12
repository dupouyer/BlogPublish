# 正文交互：article-lab

## 当前架构审查

- Astro 6.4.8，`@astrojs/react` 5 与 React 19 已安装；既有导航、评论等使用 islands。
- Content Layer glob 接受 md/mdx，但没有 `@astrojs/mdx` 集成，因此不能把 glob 支持误当成 MDX 组件已经可用。本方案保留 `.md`，不升级依赖。
- Three.js 0.182 与 React Three Fiber 9 已安装，目前用于可选雪景；配置已有关闭雪景时的条件打包。它们可以承载真正需要 WebGL 的 lab，不应作为二维投影的默认依赖。
- `CustomContent.astro` 承载正文和增强脚本；现有 Markdown remark/rehype 管线支持原始 HTML、自定义语法、数学。新增 rehype 转换只识别注册的本地 lab 链接。
- `astro.config.mjs` 没有启用 server output 或 adapter；Pages 构建仍静态输出 dist。新 `/labs/[id]` 路由也通过 getStaticPaths 预生成，不要求 Worker、服务端会话或新部署入口。

## 在 Markdown 中使用

在独立段落中写：

```markdown
[交互：方向分量](/labs/dot-projection)
```

`rehypeArticleLab` 将已注册 lab 的独立链接转换成延迟加载 iframe、永久静态说明和独立打开链接。普通行内链接与未知 id 保持原样。标题和 fallback 来自 registry，避免每篇手工复制 iframe 配置。

框架边界：registry 保存合法 id、标题、说明；页面拥有绘制与交互；`InteractiveDemo.astro` 提供文章实验外壳；post 只依赖 URL，不依赖具体 React 实现。可用 SVG、Canvas 或 Three.js 编写新页面，框架不强制 renderer。

## 添加实验

1. 在 `src/lib/article-lab/registry.ts` 注册唯一 id、标题、family 和能独立阅读的默认状态说明。
2. 在 `/labs/[id].astro` 为新 family 选择实验组件。基础计算放纯函数模块，避免在渲染与文章中各自维护公式。
3. SVG/Canvas 优先。Three.js/R3F 仅在真正需要 3D 场景时使用动态 import；必须处理无 WebGL、初始化失败与资源 dispose，提供 SSR fallback，浏览器 globals 不得在 build 时执行。
4. React 使用 `client:visible`。Canvas 的静态 fallback 可放入 `InteractiveDemo` 的 slot，增强成功后才隐藏。当前 VectorLab 由 SSR 输出默认 SVG、数值与说明。
5. 正文用独立段落链接嵌入，并就近写出变量、操作目标、预期变化与边界。

## 延迟加载、主题和生命周期

iframe 使用浏览器 `loading=lazy`，实验岛另用 `client:visible`，正文不导入 WebGL 包。iframe 具有 title，滑块支持键盘，按钮至少 44px，拖动端点有触摸区域；图像采用 responsive viewBox。

父正文仅接受同源、source 匹配该 iframe 的尺寸通知，并限制高度。实验监听父文档暗色 class，独立页使用保存的 theme；观察器在 pagehide 清理。无连续动画，不需要后台渲染循环。新动画还应遵循 reduced-motion，并在不可见时暂停。

无 JavaScript 时，浏览器默认 iframe 高度仍可显示部分内容并内部滚动；正文永久保留静态说明和链接，实验 HTML 包含默认 SVG/读数与 noscript 说明。

## 当前示例与限制

dot/cross 文章包含 16 个独立实验状态入口，复用五种 renderer family。每个核心概念就近嵌入，通用控件允许观察关联量。三维面采用可旋转的 SVG 正交投影，三张坐标平面图的分量计算为世界坐标，改变相机不会改变分量。

Dot/Ray 主图显示 XY 视图；非零 Z 仍参加数值计算，图不能表示全部 Z 深度。Ray 平面固定 x=depth，N 固定 +X；一般法线情形由正文推导解释。射线超出图示范围时只显示数值和范围说明。单位法线箭头固定显示长度，真实 Cross 向量由读数显示。

文章代码是 HLSL 说明性示例，没有宣称特定引擎实测。数值阈值属于本实验的策略；接入项目时必须按输入单位和约定调整。

## 图形尺寸与查看器

主图使用 `fitPlot` 根据实际几何范围构造居中的 500:340 viewBox，保留标签边距；CSS 宽度限制为 680px，并在手机上跟随容器缩小。单位输入使用较短的参考轴，避免单位向量缩在大画布中。拖动期间冻结 viewBox，释放后重新取景；指针仍通过 getScreenCTM 的逆矩阵映射，不能按容器宽高分别缩放。

正文 SVG 需要明确的 width/height 与 viewBox，图片容器保留原始大小、居中并限制不超出正文。图片查看器用解码后的宽高给出明确的显示宽度，不能依赖尺寸未定的嵌套 flex 容器；加载与缓存重开都需要检查实际宽高、透明度和按钮操作。查看器图标随站点打包，不依赖运行时图标服务。
