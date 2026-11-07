# GDC 地形专题：图证、动画与验证

该文件供 PR 审阅。文章是技术解析；交互是教学模型，不作为原游戏源码、UE 集成或 GPU 性能测量。

## 原始图定位

| 文章 | 资源 | 原始页码 | 使用目的 |
| --- | --- | --- | --- |
| 02 Material ID | wildlands-splat.webp | Wildlands 33 | 离散 ID 的实际外观 |
| 03 流送 | wildlands-vt.webp | Wildlands 56 | 逻辑地址、映射、Atlas |
| 03 流送 | delta-id-clipmap.webp | Delta Force 96 | ID Clipmap 与场景 Renderer |
| 04 几何 | delta-cutout.webp | Delta Force 90 | 父 Patch 局部裁切 |
| 04 几何 | delta-soft-tess.webp | Delta Force 92 | 软细分选区和层级 |
| 04 几何 | wildlands-displacement.webp | Wildlands 38 | 材质高度产生可见几何 |
| 05 生产 | wildlands-masks.webp | Wildlands 75 | 粗糙、湿度、日照、水流 |
| 05 生产 | wildlands-road.webp | Wildlands 82 | 道路 Terraform 与 Splatting 输出 |

原资料：

- [Wildlands GDC 2017](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf)
- [Delta Force GDC 2025](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta+Force+Performant.pdf)

以上为技术评论所需的有限局部图引用，图注就近标明作者、页码、版权和入口；不提交完整原始演讲。8 张 `process-*.webp` 是本文运行中实验的静态关键帧，不是原项目截图。

## 独立实验入口与不变量

| 入口 | 核心状态 | 实际检查 |
| --- | --- | --- |
| material-id/id-fixing.html | Bottom 集合 → Top 排序 → 超额移除 → 运行时权重 | 两个 Bottom 例子得到 {1,2,4}；三个 Bottom 例子所有 Top 退回 Bottom |
| virtual-texture/lab.html | 反馈 → 队列 → SVT/RVT 生产者 → 槽填充 → 页表发布 | 固定需求收敛到 17 页；队列清空；槽唯一；跨区淘汰不移除常驻根；道路修改撤销依赖页 |
| virtual-texture/lab.html?tab=clipmap | 各级对齐原点 → 新旧差集 → 环形地址 | 首次各级填 64；下一步更新 [8,8,0]，不整张搬动 |
| virtual-texture/lab.html?tab=array | 撤销 → 写入 → 发布 | 无重复有效映射；新 Slice 完成后才有效 |
| geometry/lab.html | 模板 → 选块 → Morph → 局部裁切 → 位移 | 多个相机位置覆盖面积均为 1；Morph=1 共享边误差为 0；只改法线时高度范围为 0；64×64 cells 为 4225 顶点、8192 三角形 |
| authoring/lab.html | 高度层 → 差分场 → 施工 → 点排除 → 重建版本 | 点移除单调；修改源后六产物陈旧；第 5 次重建 RVT 有效而 SVT 仍旧；第 6 次全部有效 |

路径前缀统一为 `/img/posts/gdc-terrain-`。VT 模拟只采样代表性的屏幕需求；异步预算用步数表达，不换算毫秒。几何软件投影不模拟 GPU 管线；单边 Morph 不宣称完整实现任意 LOD 跳级过渡。汇流为无洼地填充的 D8 简化模型，日照为无阴影的法线代理。

## 浏览器与构建

- Chromium 131 / Playwright：4 个新动画入口、15 个流送/几何/生产主题、ID Fixing 两个例子，及既有 WebGL2 的 4 种材质模式。
- 桌面 1050px 与移动视口 390px；全部主题无页面横向溢出。复杂画布可放大并在内部横向查看；中文字体复用站点本地资源。正文长公式限制在独立滚动区，iframe 高度使用内容边界测量，避免自增反馈。
- 动画默认暂停；提供播放、单步、重置及适用的进度定位。页面不可见时停止推进；静态关键帧保留在正文。
- 检查使用真实浏览器中的状态快照、几何数值和画面。通过不代表真实移动设备 GPU 或 UE 集成已验证。
- `pnpm lint-md`、`pnpm check`、`pnpm build` 通过；完整 `pnpm lint` 中本 PR 原有的系列配置格式问题一并定向修正。
- 完整依赖安装遇到 ONNX / RE2 安装脚本环境错误，使用原锁文件 `--ignore-scripts` 完成安装后运行检查；未改依赖版本或锁文件。构建成功证明本次静态站点所需路径可运行。

需要在最新 Cloudflare Preview 再核对正文图片、公式、目录、iframe 高度、放大查看与手机布局；保留待审阅 PR，不自动合并。
