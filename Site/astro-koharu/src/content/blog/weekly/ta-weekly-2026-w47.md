---
title: "TA 技术周报 · 2026-W47：材质从静态贴图走向可缓存函数"
link: ta-weekly-2026-w47
date: "2026-11-20T08:55:57+08:00"
description: "从形变驱动的神经纹理、单码 BTF 到解析三角形抗锯齿，本期关注如何把微观外观编译成可缓存、可重光照、可稳定降采样的实时表示。"
cover: "/img/posts/ta-weekly-2026-w47/cover.webp"
catalog: true
draft: false
excludeFromSummary: true
categories: [周刊]
tags: [周刊, Rendering, Unreal Engine, Materials, Neural Textures, BTF, Anti-Aliasing, FSR, Codex]
newsletter:
  kind: digest
  issue: 2026-W47
  periodStart: "2026-11-14"
  periodEnd: "2026-11-20"
---

## 本周速览

本周值得关注的变化，不是又多一种“神经材质”，而是材质表示逐渐从静态纹理集合变成**可按状态求值、把结果缓存、再交回传统渲染管线的函数**。Deformable Texture Maps 把布料微几何对拉伸与剪切的响应编译进神经纹理；BTF 工作则把一个完整实测材质压成一个 256 维代码，并让材质分布第一次可以直接采样。两者都没有抛弃常规 shading，而是在更上游重写“材质数据怎样被存储与更新”。

- **深读（近两周补充）：Deformable Texture Maps。** 预测 opacity、normal、depth 与材质身份，而不是最终 radiance；通过 UV 页缓存、形变阈值失效和独立更新频率，把神经求值从逐像素、逐帧成本改成可复用的材质空间结果。
- **One Code per Material。** 84 个实测 BTF 共享一个 32.3M 参数 decoder，每个材质只保留 256 个浮点数；class-conditional rectified flow 可以采样新代码，但一次解码成 light-view table 仍需单张 A100 约 3.7 分钟。
- **ATS 解析抗锯齿。** 对 triangle-splat window 在像素上的积分与梯度给出闭式解，低分辨率时显著减少漏采样和闪烁；代价是单像素计算更重。
- **AMD FSR UE 插件 4.1.2。** UE 5.3–5.8 现在可在 RX 6000 与部分 Ryzen iGPU 上使用 INT8 ML upscaling，并给 RX 9000 加入 driver-assisted frame pacing；当前插件仍只支持 DX12。
- **Codex 0.169（近两周补充）。** 多 side-chat、历史任务搜索、可折叠工具细节与更严格的非受信目录规则一起出现，说明 Agent 工具链正在同时解决并行工作面与执行边界。

> 收集窗口：2026-11-14 至 2026-11-20（上海自然日）；深读与补充最多回溯至 2026-11-07。第一、第五项分别发布于 11 月 10 日与 11 月 13 日，已明确标注为近两周补充。本期不另发 Weekend Long Read。

## 精选新闻

### 1. 深读｜Deformable Texture Maps：先把动态微几何编译成材质空间，再决定何时更新

**原文发布日期：** 2026-11-10（arXiv v1，近两周补充）  
**来源：** [Deformable Texture Maps: Compiling Dynamic Microgeometry into Neural Textures](https://arxiv.org/abs/2611.13677)

#### 发生了什么

布料的视觉变化不只是 UV 被拉长：纱线间距、孔隙覆盖、局部法线与遮挡都会随 stretch/shear 重排。显式生成并渲染 yarn geometry 太贵，而把一张静态 normal/opacity 纹理跟着网格拉伸，又无法让纱线开口真正改变。

Deformable Texture Maps（DTM）把这个问题改写成一个五维函数。输入是 canonical UV `u ∈ [0,1]²` 和局部形变状态 `d = (sx, sy, sa)`；输出八个 intrinsic channels：opacity `α`、normal `n`、depth `h` 与三通道 material identity `c`。作者用 Fourier features + SIREN 联合拟合这些字段，而不是预测带光照的 RGB：

`T(u, d) → (α, n, h, c)`

这样，网络只负责“微结构在当前形变下是什么样”，最终颜色仍由 Lambert/GGX、灯光与可编辑的 yarn 参数决定。Relight、换色、parallax、fuzz shell 与 flyaway fiber 都可以复用同一份预测结果，不必重新训练。

#### 核心技术与新意

训练前，系统把 tileable yarn patch 扫过 `8 × 8 × 8` 个形变格点，共 512 个状态；将显式微几何 canonicalize 到共同材质域，再渲染出监督用 intrinsic maps。每种织法独立训练一个 width 128 的 Fourier-SIREN，30,000 steps 后收益开始明显递减。与直接插值相邻纹理状态相比，网络是在坐标与形变空间内重建纱线边界，不会把两个位置的纱线半透明叠在一起形成 ghosting。

真正有工程价值的是 runtime cache。作者没有在 fragment shader 为每个可见像素逐帧跑网络，而是：

1. 在 UV 空间把粗网格 rasterize 成 deformation texture；
2. 将 UV atlas 分成 pages，并按屏幕投影面积给每页选择 LOD；
3. 只为可见、需要更高分辨率或形变超过阈值 `τ` 的页重新求值；
4. 把 `α/n/h/c` 作为普通纹理持久保存，后续 forward pass、透明层、parallax 与 fuzz 反复采样；
5. 用独立于帧率的更新频率 `fu`，并把纹理行拆成 `G` 组轮流更新，进一步摊薄峰值。

这其实是 neural shading 与 sparse virtual texture / decoupled shading 的结合：网络不再是“每帧 shader”，而更像一个按需生成材质页的编译器。

#### 性能、限制与数字应如何解读

作者在 Three.js WebGPU、1920×1080 下比较逐屏幕像素的 deferred neural evaluation 与 UV cache。静止阶段缓存路径能持续复用结果；形变或镜头拉近触发新页与更高 LOD 时，帧率会短暂下降。论文主文只给出 Figure 9 的时间序列而没有一个可跨场景复用的平均 FPS，因此不应把“interactive frame rate”当成固定预算。

压缩侧更明确：选用的 width 128 模型在质量介于 ASTC `8×8` 与 `12×12` 的比较中，存储量减少约 42–94×。这不是白拿的压缩率——网络求值、缓存纹理、失效调度与更新延迟共同构成新成本。

当前边界也很清楚：

- 每个 DTM 只覆盖一种微结构和有限形变域，未证明跨织法迁移或域外外推。
- 输入只有面内 stretch/shear，不含 bending、局部压缩与接触造成的纱线扁平化。
- 表面附着的 `α/n/h/c` 无法还原完整 3D 可见性、复杂 silhouette、深层 transmission 或 multiple scattering。
- 现有 shading 只是通用 Cook–Torrance，没有 yarn-direction-dependent reflectance。
- normal、连续 depth、categorical material ID 的正确 MIP/filtering 方式不同，多通道的尺度滤波尚未解决。
- 阈值 `τ` 约束的是形变差，不是最终视觉误差；低更新率与交错行更新会留下陈旧或相邻状态不一致的 texel。

#### 对 TA / UE5 的实际价值

这篇论文最值得迁移的不是 SIREN，而是**把内容生成频率和画面刷新频率解耦**。UE5 中可先不用神经网络：为一块布料准备 4–8 组受控 stretch/shear 状态的 opacity、normal 与 height，运行时从 UV-space deformation buffer 计算页级失效，更新 Render Target 或 Virtual Texture 页面；材质主 pass 只读缓存。

同一思路也可用于受风弯曲的细叶或草簇，但不能直接照搬论文的三维形变描述符。植被需要加入 bend/curvature、朝风方向与视角相关的覆盖变化；先验证“局部状态 → intrinsic maps”是否近似成立，再考虑网络压缩。若结构变化依赖邻域碰撞或大范围遮挡，DTM 的局部函数假设就会失效。

**阅读成本与建议：** 45–60 分钟。先看 Figures 1、3、6、9，把表示、缓存、覆盖变化和性能时序串起来；再读 Sections 2.1–3.2 的形变参数、UV page LOD 与 invalidation；最后务必看 Section 6，尤其是 domain extrapolation、3D visibility 与 filtering 三类限制。

### 2. One Code per Material：把十亿级实测外观变成一个可采样的材质点

**原文发布日期：** 2026-11-16（arXiv v1）  
**来源：** [One Code per Material: Neural Representation and Generation of Measured BTFs](https://arxiv.org/abs/2611.20948)

#### 发生了什么与新意

BTF 记录平面样本在每个 texel、入射方向和观察方向下的 RGB，能保留织物、皮革与地毯的 parallax、自遮挡和互反射，但 UBO2014 中一块 `400² × 151² × RGB` 材质约有 `1.1 × 10¹⁰` 个值。已有 neural BTF 往往仍为每个 texel 存 latent，材质只是另一张巨大的 feature texture。

作者给出两个 operating point。高保真版本为单材质训练四层、宽 1024 的 Fourier-feature MLP；紧凑版本则让 84 个材质共享四层、宽 3072、32.3M 参数的 decoder，每个材质只保留一个 256-float code。decoder 输入 texel 坐标、Rusinkiewicz half/difference directions 与材质 code，输出 HDR reflectance；log-space L1 让高光和暗部都能参与训练。相对 matched-size 的 Xia 等方法，单材质版本高 3.2 dB PSNR；紧凑版本相对 Rainer 的 per-texel latent 高 1.2 dB，同时把每材质独立数据从百万级 latent 降到 256 个数。

![实测 BTF 的编码、共享解码与生成流程](/img/posts/ta-weekly-2026-w47/btf-code-pipeline.webp)

> 原论文 Figure 2：set encoder 将实测材质与 colourways 压成 256-float code；共享 decoder 接收位置、光线与视线方向，既重建材质，也解码 rectified-flow 采样的新材质。页面裁切并转换为 WebP；© 论文作者，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。

材质成为全局点后，作者可以在 code space 上训练 class-conditional rectified flow。由于原始数据只有 7 类、每类 12 个实测材质，先用类内 `3×3` 颜色变换生成 colourways，把训练集合扩到 886 个，再采样 carpet、fabric、felt、leather、stone、wallpaper 与 wood 的新 code。

#### 性能、限制与 TA 价值

紧凑模型在单张 NVIDIA A100 上用 bfloat16 训练 705k steps；生成材质 code 不是运行时瓶颈，真正昂贵的是把 code 解码成完整 light-view table：论文报告每个样本约 3.7 分钟/A100。解码后与 tabulated measured BTF 成本相同，因此这更像**离线材质烘焙与资产压缩**，不是可直接放进 UE pixel shader 的实时模型。

生成能力也不能被误读为“任意新材质”。每类只有 12 个实测结构，样本大多贴近训练材质与 colourways，结构创新主要是少量训练结构的混合；材质范围限于 5 cm 平面样本和既定光视方向。共享 decoder 仍有 32.3M 参数，只有在材质库规模足够大时，每材质 256-float 的说法才有摊销意义。

对 TA 的价值在于把材质标准化从“统一 BaseColor/Roughness 通道”推进到“统一条件查询接口”。短期可把 BTF 作为离线真值库：从 UE 中选定离散 light/view slices，烘焙成 VT、neural texture 或可压缩的 basis；用同一套固定灯、掠射角和 HDR exposure 测试 SVBRDF 丢失了哪些 mesoscale cue。长期再评估 code-space 的检索、混合和生成是否值得引入资产库。

**阅读成本与建议：** 35–50 分钟。优先看 Figures 1–2、Sections 3.1–3.4、Table 1 与 Section 4.4；Figure 8 用于检查生成材质是否真的随光源移动而重光照，Limitations 则解释了结构新颖度与一次性解码成本。

### 3. ATS：三角形 splat 的像素覆盖可以精确积分，但正确性仍要付算力

**原文发布日期：** 2026-11-17（arXiv v1）  
**来源：** [ATS: Anti-Aliased Triangle Splatting with Exact Per-Primitive Integrals](https://arxiv.org/abs/2611.22512)

#### 发生了什么与核心原理

Triangle Splatting 原本在像素中心采样 triangle window，并剔除 inradius 小于一像素的 primitive。镜头拉远时，大量亚像素三角形既可能落在采样点之间，也可能被直接裁掉，导致细节消失和时域闪烁。

ATS 证明了这个 window 在一个像素覆盖域上的积分有闭式解。角平分线把三角形分为三个子三角形；每块内的 window 可写成到某条边距离的幂。把子三角形裁剪到像素后，用 Green’s theorem 将面积积分化成边界积分，forward integral 与对 edge normal、offset、smoothness 的梯度都只需每条边一个闭式项。于是训练和推理都能使用真正的 pixel footprint，而不是提高采样率近似。

精确积分还带来 conservative culling：只剔除积分后不可能达到 alpha cutoff 的三角形，而不是用一像素 inradius 的几何启发式。为避免低分辨率下 tile 数太少而无法占满 GPU，作者把 primitive 按 depth 拆到 `8×8` tiles，提高并行度。

#### 性能、限制与 TA 价值

在 RTX 5090、九个 Mip-NeRF 360 场景上，带 depth split 的精确版本在训练分辨率到 `1/8` 分辨率间为 99–322 FPS；`2×2` supersampling 为 101–350 FPS，仍更快。精确积分的价值主要在稳定性：`1/8` 分辨率的 sub-pixel pan 中，frame-difference error 从 `2×2` supersampling 的 9.2 降到 3.3；多尺度训练后，在 Mip-NeRF 360 的 `1/8` 处达到 31.00 dB / 0.941 SSIM / 0.046 LPIPS。

它并没有解决所有 aliasing。每个 primitive 最终仍以一个 alpha 在像素级 compositing，共享像素的边缘仍有 blending error；细纹理则可能产生 moiré。算法也比基线和 `2×2` supersampling 更重，论文明确把 kernel optimization 与 opacity distribution/A-buffer 视为后续问题。

对实时 TA 的启发是：先区分**覆盖漏采样、纹理频率、alpha compositing**三类误差。MSAA/SSAA 不一定能捕获所有亚像素 primitive，精确 coverage 也不会自动修好 blend order。UE5 中可做一个 compute/raster 小实验：同一簇亚像素三角形分别用中心采样、`2×2`、解析/高精度 coverage reference 渲染，记录静态 PSNR 之外的 sub-pixel pan temporal error；若问题主要出在 alpha 合成，则应转向 OIT/A-buffer，而不是继续堆 sample count。

**阅读成本与建议：** 35–50 分钟。先看 Figures 1–3 与 Section 3.2 的三块积分，再看 Tables 3–4、Section 4.3 和 Figure 7；推导实现者再读补充 Sections 10.2–10.3。最重要的是把 Table 4 的 FPS 与 Section 4.5 的 blending 限制一起看。

### 4. AMD FSR UE 插件 4.1.2：ML upscaling 下沉到 RDNA 2 与部分 Ryzen iGPU

**原文发布日期：** 2026-11-16  
**来源：** [AMD FSR UE plugin updated with FSR Upscaling 4.1.2](https://gpuopen.com/learn/amd-fsr-ue-plugin-412/)

#### 发生了什么与工程要点

AMD 将 FSR Unreal Engine 插件更新到 4.1.2，覆盖 UE 5.3–5.8。最大变化是 ML upscaling 不再只面向 RX 7000/9000：RX 6000 和部分带 Radeon Graphics 的 Ryzen 处理器也进入支持范围。插件根据硬件自动选择两个 INT8 模型之一：RX 6000 与 Ryzen AI Max 使用完整模型；受限 iGPU 使用小于其一半的专用模型。其他硬件仍可落回 analytical FSR 3。

Frame Generation 更新为 4.0.2，并通过 Swapchain 4.0.0 在 RX 9000 上加入 Driver-Assisted Frame Pacing：把最终 present timing 交给 display driver，更接近显示管线调度，目标是减少 CPU overhead 与帧间抖动。它要求 Adrenalin 26.10.1+、默认 `OverrideSwapChainDX12=true`；FG 4.0.2 还要求 Windows 11。Anti-Lag 2 UE 插件同步到 2.0.6，用于 FG 开启时的端到端延迟控制。

#### 性能、限制与 TA 价值

官方文章没有给出一组可跨游戏复用的性能数字，并明确指出结果依赖游戏、分辨率、quality mode 与硬件。当前 UE 插件只支持 DX12；FSR SDK 2.4 已有的 Vulkan upscaling/FG 尚未进入插件。还要把 driver-delivered model update 当作兼容性变量：同一游戏 build 可能随驱动获得新版本，QA 不应只记录插件号。

实际落地点是建立一张 device/driver/mode 测试矩阵，至少覆盖 RX 6000、受支持 Ryzen iGPU、RX 9000，以及 analytical fallback。除平均 FPS 外，同时记录 frame-time percentile、present interval、UI/透明粒子 ghosting、disocclusion、sharpening、FG latency 与切换模式时的资源生命周期。手持设备不要只看“能运行小模型”，还需测功耗、温度与持续帧率。

**阅读成本与建议：** 10–20 分钟。先看硬件模型选择、DX12/Vulkan 边界和 Frame Pacing requirements；随后对照插件 guide 的 Requirements 与迁移说明。没有目标硬件实测前，不应把“更广支持”写成同等画质或同等成本。

### 5. Codex 0.169：并行工作面变宽，非交互执行边界也变硬

**原文发布日期：** 2026-11-13（近两周补充；上海时间）  
**来源：** [Codex CLI 0.169.0 release](https://github.com/openai/codex/releases/tag/rust-v0.169.0)

#### 发生了什么与新意

0.169 的显性变化是 terminal workspace 支持多个 side-chat tab，并能在重启后恢复本地 side chat；agent command center 可按名称、prompt preview 或工作目录搜索旧任务；full-screen transcript 可以折叠已完成的工具活动，同时保持答案与工具输出可搜索。它们共同处理一个 Agent 工程问题：并行线程增多后，用户需要在“多个上下文”与“可审计执行记录”之间快速切换。

更值得自动化关注的是 trust 语义。`codex exec` 在未受信目录中，即使指定 `--sandbox workspace-write`，也会继续禁用项目配置和 MCP servers；必须显式使用 `--trust` 才保存项目信任。另有中断 turn、延迟 abort 与 file approval cancellation 的修复，避免上一轮的取消信号误伤后续 turn。

#### 限制与工作流价值

多 side-chat 不是共享事务：分支、工作树、外部资源与产物的所有权仍需明确。恢复 UI 状态也不等于恢复所有外部系统状态。对 TA 工具链，适合把线程按“资料核验 / Shader 实现 / 性能测试 / 发布检查”拆分，但每条线程仍要输出可验证的文件、commit 或 benchmark 证据。

CI 与无人值守脚本应显式验证 trusted workspace，而不是靠 `workspace-write` 推断 MCP/项目配置一定启用。升级后重点回归：未受信目录是否按预期禁用工具、approval/abort 是否只影响当前 turn、MCP startup failure 是否能被看见，以及恢复 side-chat 后 cwd、模型和 provider 是否符合预期。

**阅读成本与建议：** 10–15 分钟。先读 New Features 与 Bug Fixes；自动化维护者重点看 project trust、MCP startup、interrupt/cancellation 与 SQLite WAL 更新，不必通读全部 498 commits。

## 优先阅读顺序

| 优先级 | 内容 | 阅读成本 | 为什么先看 |
| --- | --- | --- | --- |
| 1 | Deformable Texture Maps | 45–60 分钟 | 本期深读；把动态微结构、intrinsic maps、UV 页缓存和更新频率连成可迁移的实时管线。 |
| 2 | One Code per Material | 35–50 分钟 | 直接关系到 BTF、材质标准化与“实测外观如何成为可检索/生成资产”。 |
| 3 | ATS 解析三角形抗锯齿 | 35–50 分钟 | 能明确区分 coverage、texture 与 blending 三种 aliasing 来源，并有完整性能数字。 |
| 4 | AMD FSR UE 插件 4.1.2 | 10–20 分钟 | 近期 UE 项目可直接验证，重点是硬件矩阵、frame pacing 与 DX12 边界。 |
| 5 | Codex 0.169 | 10–15 分钟 | 对多线程 Agent 与无人值守执行有实际影响，但不是渲染核心。 |

## 本周动手实验

**做一个“不含神经网络”的形变驱动材质页缓存。** 目标是验证 DTM 的工程结构是否值得继续，而不是先训练 SIREN。

1. 为一块 `1 m × 1 m` 网格布准备 4 组状态贴图：中性、X 拉伸、Y 拉伸、剪切；每组包含 opacity、normal、height 与 yarn/material ID。
2. 在 UE 中从当前/参考 UV 边或局部 deformation gradient 计算 `(sx, sy, sa)`，写入低分辨率 deformation buffer。
3. 将材质 UV 分成固定 pages。只有 page 内最大形变差超过 `τ`、进入相机或请求更高 LOD 时，才更新对应 Render Target 区域。
4. 对比三种策略：逐像素每帧混合、每帧全 atlas 更新、页级阈值更新；记录 GPU time、更新 texel 数、cache memory 与从形变发生到视觉更新的延迟。
5. 用突然拉伸、缓慢累积变形、相机快速推近和静止布料四种序列检查 stale texel、页边界、normal MIP 与 categorical ID filtering。

若页缓存能稳定降低更新量，再把状态插值器换成小 MLP/SIREN；若瓶颈仍在透明 overdraw 或 shading，神经压缩不会自动解决它。

## 趋势观察

Neural Rendering 正从“网络直接吐最终 RGB”转向“网络生成可复用的中间表示”。DTM 输出 intrinsic maps，BTF decoder 输出可烘焙的 light-view table；这让 relighting、传统材质编辑与现有 shader 管线继续成立，也把性能问题从每帧推理转成缓存失效、LOD 与离线解码。

另一个明显趋势是**正确性与调度被一起设计**。ATS 的闭式 coverage 仍需 depth split 才能在低分辨率占满 GPU；FSR 的画质模型更新也必须和 swapchain、driver pacing、Anti-Lag 与 QA 矩阵一起评估。单个算法指标越来越不足以描述真实实时体验。

Agent 工具链则继续扩展并行工作面，但同时收紧 trust 与 cancellation 的语义。多线程不是可靠性的替代品；可恢复、可检索、可审计和显式授权会成为生产 Agent 的基础设施。

## 来源与核验

- 本期主窗口为 2026-11-14 至 2026-11-20（上海自然日）；DTM 与 Codex 0.169 分别是 11 月 10 日、11 月 13 日发布的近两周补充，没有使用未来内容。
- 三篇论文的日期、方法、表格与限制均按 arXiv v1 正文核对；ATS 的 FPS 来自 RTX 5090、九个 Mip-NeRF 360 场景的论文协议，不外推到普通游戏几何。
- BTF 论文在 arXiv 标注 CC BY 4.0；正文仅使用 Figure 2 的页面裁切与 WebP 转换，保留作者归属、图号、原文与许可证。其他论文未复制原图。
- AMD 条目以 GPUOpen 官方文章与插件 requirements 为准；没有把“支持新硬件”解释成跨设备同画质或同成本。
- Codex 条目以 openai/codex 官方 GitHub release 为准，使用正式 0.169.0，不采用 alpha prerelease 作为主结论。
- 固定检查了 [Unreal Engine 官方 YouTube 频道](https://www.youtube.com/@UnrealEngine/videos) 与 Epic 官方公告。本窗口内可确认的新内容是 11 月 19 日的 [MetaHuman Animator Markerless Motion Capture Deep Dive](https://youtube.com/live/zd7DCFBLCcc)；出刊时尚缺足够稳定、可逐段复核的技术材料，因此只记录检查结果，不为固定项凑入五条。
- 封面为本期生成图，表现微观纤维被编译为 intrinsic texture pages，再进入稳定实时渲染；不使用第三方品牌元素或内嵌文字。
