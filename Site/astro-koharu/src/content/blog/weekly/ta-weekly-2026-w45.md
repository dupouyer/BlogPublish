---
title: "TA 技术周报 · 2026-W45：管线边界正在决定实时质量"
link: ta-weekly-2026-w45
date: "2026-11-06T09:02:23+08:00"
description: "从全 GPU 纹理网格、混合运动先验到可逆 HDR 色彩链路，本期关注的不是再加一个模型，而是把数据、误差与状态放在正确的管线边界。"
cover: "/img/posts/ta-weekly-2026-w45/cover.webp"
catalog: true
draft: false
excludeFromSummary: true
categories: [周刊]
tags: [周刊, Rendering, GPU, Super Resolution, Unreal Engine, HDR, AI Agent]
newsletter:
  kind: digest
  issue: 2026-W45
  periodStart: "2026-10-31"
  periodEnd: "2026-11-06"
---

## 本周速览

本期五项内容横跨实时重建、神经超分、AAA 色彩管线、UE 灯光与 Agent 工具链，但主线高度一致：**单点算法已经很难独自决定最终质量，真正拉开差距的是数据在哪一侧停留、误差在哪一层修正，以及跨阶段状态能否可靠延续。**

- **深读：GPU-Native Textured Mesh。** 从多路 RGB-D 输入到 TSDF、Marching Cubes、拓扑清理、视图选纹理、补洞与曝光接缝修正，全链路留在 GPU；重点不是某个新算子，而是消除中间往返与为 GPU 重写网格拓扑。
- **PlaySR。** Sony 将引擎 Motion Vector 与图像 Optical Flow 组合：前者便宜且擅长几何运动，后者补足阴影、反射和透明等非几何运动。
- **War Thunder × DLSS 5。** 真正困难的不是接 SDK，而是让工作在 sRGB 的神经阶段插入线性 HDR 管线，并能把结果无损地映回后续后期链路。
- **上周补充：UE5.8 MegaLights。** 官方教学把“成千动态灯”拆成固定每像素采样预算、光源重要性引导、混合求交与去噪，并给出可直接用于 TA 排查的复杂度工具。
- **上周补充：Codex 0.166。** `queue --resume`、恢复权限状态、恢复子线程与跨 fork 的 token 记账，说明 Agent 的可靠性开始取决于“恢复语义”，而不只是单轮能力。

> 收集窗口：2026-10-31 至 2026-11-06（上海自然日）；深读与补充回溯至 2026-10-24。第 4、5 项明确使用 14 日补充窗口。本期不另发 Weekend Long Read。

## 精选新闻

### 1. 深读｜把整条纹理网格重建链路留在 GPU

**原文发布日期：** 2026-11-02（arXiv v1）  
**来源：** [论文 HTML](https://arxiv.org/html/2611.03033) · [项目页](https://unclearness.github.io/grtmesh/) · [官方实现](https://github.com/unclearness/grtmesh)

#### 发生了什么

Hiroyuki Sato 提出一套面向多路同步 RGB-D 的实时纹理网格系统。输入图像只批量上传一次，之后的畸变校正、深度对齐、稠密 TSDF 融合、Marching Cubes、连通域噪声清理、逐面视图选择、UV 补洞与辐射接缝修正都驻留在 GPU；CPU 最后只接收完成的网格、UV 与 atlas。

与“TSDF 和 MC 已经在 GPU 上”不同，这项工作的目标是**每一帧都输出可直接进入标准图形管线的三角网格与纹理图集**。以往系统常在网格抽取之后回到 CPU 做邻接、连通域或纹理处理，或者在多个阶段之间反复搬数据；高分辨率下，传输与容器管理甚至会压过融合本身。

论文在五路 Kinect 的 CMU Panoptic 数据上报告：体素尺寸为 2 cm 时，完整流程每帧 13.1 ms，包含原始输入上传和 GPU 预处理；未裁剪全部 2000 帧时平均 13.2 ms，95 分位为 15.2 ms。体素为 5 mm 时，相对 Open3D CPU 路径与 CUDA nvblox 的峰值加速分别为 89.7× 与 29.4×。测试硬件是 RTX PRO 6000 Blackwell Max-Q + Threadripper 9970X，不能直接外推到普通游戏 GPU。

#### 核心技术与新意

第一层新意是为后续网格操作设计了 **fixed-size-array adjacency**。Marching Cubes 只给出顶点和面列表，没有可供连通域、补洞或接缝遍历使用的邻接关系。作者将每条无向边编码为 64-bit key，对全部 `(edge key, face id)` 做 radix sort，再把共享边的面配对。三角网格每个面最多三个边邻居，因此邻接可以固定为长度 3 的数组，避免通用 half-edge 结构的额外引用、动态分配与分支发散。

这份邻接不是只服务一次清理，而是贯穿后续阶段：

1. **噪声移除**使用标签传播做连通域，把小碎片压缩掉；
2. **纹理映射**按深度一致性和面法线/视线夹角为每个面独立选择相机；
3. **补洞**从已分配邻面传播 UV，最多迭代五次，以固定上界换延迟可预测；
4. **接缝修正**在不同相机负责的相邻面之间采样亮度差，求解每相机的低频增益场并直接烘回 atlas。

第二层新意是接缝修正。每个面只选一台相机，天然会在相机边界出现曝光跳变；一个全局 gain 又无法处理暗角、局部 tone mapping 或 ISP 带来的空间变化。作者为每台相机维护 `24 × 16` 的 log-gain 网格，在 seam 两侧取对应样本，用 log-luminance 中位差建立相机间约束，再用平滑与单位增益锚点做 12 次 Jacobi 迭代。增益经指数映射后乘回线性 RGB，并用 EMA（论文默认当前帧权重 0.15）稳定时间变化。

这一步只修正**相机之间的相对低频差异**：共同作用于所有相机的曝光变化不可观测，几何/标定误差造成的锐利局部错位也不会消失。实验中 seam 残差下降约 27.3%–36.5%；开启修正将帧时间从 10.8 ms 增至 13.1 ms，其中主要的 seam correction 约 1.9 ms。

第三层新意其实是工程纪律：把全链路写成有界、数据并行的 GPU 工作。代价也很清楚——一帧约有 244 次 kernel launch；连通域标签传播在 room-scale 网格上通常会撞到 100 次上限而未完全收敛；5 mm 体素时完整收敛可能需要数百乃至数千次传播。作者用“最多误删极少量面”换取固定时延，而不是假装算法已经精确完成。

#### 性能、限制与如何解读数字

- 细节上限仍由体素尺寸决定；更细的体素会迅速增加稠密体积的内存与时间。
- 可见性只在三角形顶点检查，跨越深度断层的大三角形内部可能仍选错相机。
- 低频增益只适合平滑、乘法型曝光差；小主体若在 `1/8` 代理图上只占很少像素，需要更细采样。
- 固定 atlas 直接把五张 1920×1080 图像竖直堆成 1920×5400，简单、时序稳定且便于视频编码，但没有压缩未被网格使用的区域；论文没有评估传输压缩。
- 官方代码是 **source-available 的非商业许可证**，并非 MIT/BSD；商业项目不能把“有源码”误读成“可直接集成”。

视觉质量也要谨慎解读：方法在 LPIPS 上仅次于约 13 秒/帧的离线 SPSR + mvs-texturing，但 PSNR 排序不同，说明纹理清晰度与逐像素失真存在典型的 perception–distortion 取舍。13.1 ms 与离线基线相差约 993×，证明的是全 GPU 管线的可行性，不是与离线方案等价。

#### 对 TA / UE5 的实际价值

对实时角色扫描、虚拟制片预演、数字人预览与 AR/VR 采集，最值得迁移的是三点：

- **先画数据驻留图，再优化算子。** 标出每一阶段的资源所有权、同步点、读回字节数和格式转换；一次不必要的 mesh readback 可能比一个更快的 CUDA kernel 更值得先删。
- **为目标 GPU 操作选择拓扑。** 如果只需要三角面邻接，固定三邻居数组可能比完整 half-edge 更合适；若 UE Compute Shader 复现，可用排序后的 edge key buffer 生成邻接，再用 StructuredBuffer 驱动连通域或 UV 传播。
- **将外观误差放到最便宜的域里。** 相机接缝不一定需要全局纹理重优化；低频 gain grid、稀疏 seam 约束和有限次 Jacobi 就能先解决主要曝光差。

**UE5 落地点：** 做一个小型 Render Graph 实验：以现成三角网格和 3–5 张相机纹理为输入，先实现 edge-key 排序/邻接构建，再做 seam 采样与 `24 × 16` gain-grid Jacobi。输出校正前后 atlas、seam residual、GPU time、kernel/dispatch 数和读回字节。无需先复现完整 TSDF，就能验证这套“拓扑驻留 + 低频外观修正”的价值。

**阅读成本与建议：** 45–60 分钟。先看 Figure 2 与 Sections 3.2、3.6、4.1、5 Limitations；实现者再读 Appendix A 的 kernel launch 分解、Appendix C 的 gain-field 变体和 Appendix E 的体素尺寸/显存曲线。项目页视频适合检查时间稳定性，而不是只看静帧。

### 2. PlaySR：让 Motion Vector 管几何，让 Optical Flow 补非几何运动

**原文发布日期：** 2026-11-03（Sony Research 公开文章；论文此前发表于 ECCV 2026 LoViF Workshop）  
**来源：** [Sony Interactive Entertainment Research](https://sonyinteractive.com/en/news/blog/playsr-real-time-super-resolution-in-gaming/) · [作者技术说明](https://ayankumarbhunia.github.io/) · [OpenReview 论文页](https://openreview.net/forum?id=jcDKvREUyt)

#### 发生了什么

PlaySR 是一套面向游戏 Deferred Rendering 的神经超分框架，输入包括低分辨率颜色、深度和引擎 Motion Vector（MV）。它没有把 MV 当成唯一可信的重投影依据，而是同时估计 Optical Flow（OF），学习在两者之间动态分配权重，再用轻量 SR 网络重建高分辨率帧。

关键判断很符合真实渲染管线：MV 对摄像机和刚体/骨骼等几何运动便宜且准确，但阴影、镜面反射、透明、粒子与屏幕空间效果的像素变化未必能由几何速度描述；OF 直接观察图像变化，可以补这些区域，却更怕大位移、遮挡，并增加计算成本。PlaySR 将 MV“蒸馏”到图像空间，用 OF 作为纠错信号，而不是让两个网络各做一遍完整对齐。

#### 核心技术与新意

官方摘要提到两个值得工程团队记住的设计：

1. **反偏置的数据增强。** 训练集很容易让模型发现“MV 大多数时候已经够用”，继而忽略更昂贵的 OF；作者加入专门增强，迫使模型学习 MV 失真或不完整时如何使用像素运动。
2. **无额外参数的 attention。** 轻量 SR 主干通过 parameter-free attention 调节特征，而不是继续堆通道和参数，把有限预算留给时序对齐。

新意不是“MV + OF”这个组合本身，而是把二者视为互补先验，并显式处理训练偏置。这个问题同样会出现在 Frame Interpolation、Frame Extrapolation、Multi-Frame Generation 和 Ray Reconstruction：渲染器知道“物体怎么动”，图像模型知道“最终像素怎么变”，两者不能互相替代。

#### 限制与 TA 实践价值

本周公开的 Sony 文章没有给出输入/输出分辨率、目标硬件、毫秒成本、网络参数量或与 DLSS/FSR/PSSR 的可复现对照；它也没有宣布进入任何 PlayStation 产品。OpenReview 在核验时触发了浏览器验证，因此本期只使用 Sony 摘要、作者说明和可公开访问的元数据，不编造论文表格数字。

对 TA 最直接的价值是建立一张**运动信息可信度测试图**：

- 几何边缘、骨骼与相机运动：MV 应是主信号；
- 屏幕空间阴影、反射、透明、折射和粒子：检查 MV 是否缺失、继承背景速度或与最终像素错位；
- disocclusion 与极细几何：检查 depth rejection、reactive mask 和 OF 是否互相冲突；
- 后期前后的颜色变化：确保 OF 看到的图像域与重建目标一致。

在 UE5 中无需先训练网络：先离线导出 BaseColor/SceneColor、Depth、Velocity、Translucency/Reactive Mask 与相邻帧，运行一个现成 OF 模型，制作 `|warp(MV) - current|` 与 `|warp(OF) - current|` 的误差热图。按材质域、透明类型和光照通道统计，找出“引擎速度不解释像素变化”的区域，之后再决定是否需要学习融合。

**阅读成本与建议：** 15–20 分钟。先看 Sony 摘要与作者页的 Key Idea；要做复现应等待或取得可稳定访问的全文与模型细节后，再核对训练集、损失、推理成本和消融，当前不适合做横向性能排名。

### 3. War Thunder 的 DLSS 5 集成：神经阶段逼迫 HDR 色彩链路可逆

**原文发布日期：** 2026-11-03  
**来源：** [NVIDIA 对 Gaijin 的开发者访谈](https://www.nvidia.com/en-us/geforce/news/war-thunder-dlss-5-3d-guided-neural-rendering-developer-interview/)

#### 发生了什么

Gaijin 将 DLSS 5 3D-Guided Neural Rendering 接入自研 Dagor Engine。访谈最有价值的部分不是“更真实”的对比图，而是一个明确的管线冲突：DLSS 5 在 sRGB 域工作，而现代游戏引擎的光照、曝光与后期通常在线性 HDR 域完成。

如果把神经阶段放在所有 PostFX 之后，Bloom、Motion Blur、色差和 UI 都可能被当成要重新解释的场景内容；如果过早放在线性 HDR 中，模型又看不到玩家最终看到的 look。Gaijin 的做法是让色彩管理链路**可逆**：先从线性 HDR 生成一个带目标观感的“半成品” sRGB 图像供 DLSS 5 处理，再把模型产生的改动映回线性 HDR，继续执行后期与 UI 合成。

#### 核心技术与新意

这相当于把传统单向的 `scene-linear → exposure/tone/look → display` 改成可往返的接口：

`linear HDR → reversible look transform → sRGB neural stage → inverse transform → linear HDR → postFX/UI`

难点不只是写一个 inverse tone mapper。实际链路中可能有 clamp、局部曝光、gamut mapping、LUT、非单调曲线、显示峰值压缩与按内容变化的参数；只要某一步不可逆，映回 HDR 的增量就会偏离原始光能关系。访谈没有公开具体公式，因此不能假定 Gaijin 的实现适用于 ACES、AgX 或 UE 默认 Filmic 的任意配置。

它也展示了神经渲染的新集成角色：模型不再只是“低分辨率到高分辨率”的末端放大器，而是会改写高光、阴影、微对比与材质细节的图像阶段。于是 Art Direction 的验收对象从材质和灯光扩展到“模型强度 × 色彩变换 × 天气/视距场景”。Gaijin 分别检查空战、陆战和海战，并在阴雨、湿表面等低对比场景下调模型强度，说明统一 preset 很可能不够。

#### 性能、限制与 TA 价值

文章没有提供 GPU 时间、输入输出分辨率、显存或失败案例；它来自 NVIDIA GeForce 宣传频道，画质描述应视为厂商与合作方的陈述，而非独立评测。Eagle's Shadow 更新在文章发布时仍计划于 11 月中旬上线，本期不把它写成已经交付的玩家结果。

对 TA/色彩与渲染工程，最有价值的是把每个学习型图像阶段都列入**色彩域契约**：输入是 scene-linear 还是 display-referred、范围是否允许负值和超 1 高光、编码是 linear/sRGB/PQ/HLG、alpha 与 UI 是否已合成、变换是否可逆、误差应在什么域度量。

**可立即尝试：** 在 UE5 里搭一条不依赖 DLSS 5 的可逆性测试。选择包含 HDR 高光、饱和霓虹、雾、湿表面和透明物体的场景，记录 `SceneColor → Look → InverseLook → SceneColor` 的绝对/相对误差；分别统计高光能量、色相漂移、负值、超 gamut 与 temporal stability。只要往返误差本身不可接受，就不应先接任何要求 sRGB 输入的神经阶段。

**阅读成本与建议：** 10–15 分钟。重点看访谈中 sRGB/linear HDR 的问答段；对比图只用于理解美术目标，不用于判断性能。

### 4. 上周补充｜UE5.8 MegaLights：固定成本不等于无限复杂度

**原文发布日期：** 2026-10-28（官方视频）  
**来源：** [Unreal Engine 官方教学视频](https://www.youtube.com/watch?v=LPKz7gH-T0U) · [MegaLights 官方文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/megalights-in-unreal-engine)

#### 发生了什么

Epic 发布 36 分钟的 UE5.8 MegaLights 入门教学，并将功能描述为 Production Ready。MegaLights 用统一的 stochastic direct-lighting pass 取代多种逐灯阴影与光照路径：每像素只向“重要光源”发射固定数量的射线，命中后累积该灯贡献，再通过时空去噪重建稳定结果。

它的成本模型与传统 Deferred Lighting 相反：传统路径在固定质量下随影响像素的灯数增长；MegaLights 试图保持近似固定的每像素光照成本，但当一个像素同时受太多重要灯影响时，每盏灯分到的样本不足，质量会变成噪声、模糊或 ghosting。**“支持更多灯”并没有取消内容预算，只是把预算从 draw/shadow-map 次数改成每像素重要性与样本竞争。**

#### 核心技术与工程点

- 默认先做短距离保守 Screen Space Trace，捕捉简化 Ray Tracing Scene 中缺失的小细节；离屏、被遮挡或超过长度后，再从最后有效位置继续 HWRT/SWRT。
- Ray Guiding 根据光源对像素的预计贡献分配样本，但仍需偶尔探索被认为遮挡的灯，避免可见性变化后永远采不到。
- 默认 RT shadow 路径复用整场 BVH，没有逐灯 shadow-map 成本；单灯可切到 VSM，以完整 Nanite 细节换更高 CPU/GPU/内存开销和近似 area shadow。
- Lit Translucency 与 Volumetric Fog 共享 froxel 体积中的随机采样与 shadow trace；分辨率由 `r.MegaLights.Volume.GridPixelSize`、`GridSizeZ` 控制。
- Niagara 粒子灯可进入 MegaLights 并投影，但必须限制强灯密度、影响范围与 shadow-casting 数量。

UE5.8 的实用改进是 Light Complexity 可视化：选择屏幕像素后，可以看到影响该像素的灯、权重比例、可见性和采样成本热图。配合 `r.MegaLights.Debug 1`、`r.ShaderPrint.Lock 1`、`r.MegaLights.Visualize.LightComplexity` 与 dump 命令，可以找出隐藏但仍在偷样本的强灯、过大的 attenuation bounds、伸进墙体的 rect light 和不必要的粒子灯。

#### 限制与 TA 价值

RT shadow 的质量仍受简化 Nanite fallback mesh、RT culling、动画顶点预算与 BVH 范围限制；提高 fallback 精度会增加 build time、内存与 traversal cost。Alpha Masking 只有屏幕空间路径默认正确，RT 材质求值需开启 `r.MegaLights.HardwareRayTracing.EvaluateMaterialMode 1`，且有明显开销。官方仍建议太阳等强 Directional Light 走 Deferred + VSM，把 MegaLights 留给局部或较软的灯。

对 TA 来说，这是一套新的灯光预算语言：不要只统计关卡灯数，而要统计**每像素候选灯数、重要性分布、被遮挡但仍需探索的样本、RT representation 误差和 denoiser 压力**。

**UE5 落地点：** 复制一个实际关卡，逐步加入 32/64/128 个动态灯；每档记录 MegaLights GPU 时间、sampling-cost heatmap、历史稳定性和 ghosting。第二轮不删灯，只收紧 attenuation、spot cone、rect barn door，并合并同组小灯，观察质量能否在相同固定预算下恢复。

**阅读成本与建议：** 视频 36 分钟。先看前半的系统概览与启用方式，再直接对照文档的 Technique Overview、Lighting Complexity、Shadowing Methods、Particle Lights 与 Lit Translucency；做项目排查时，文档比线性看完整视频更高效。

### 5. 上周补充｜Codex 0.166：Agent 的恢复语义开始成为工程能力

**原文发布日期：** 2026-10-30（GitHub 于 2026-10-29 19:47 UTC 发布）  
**来源：** [Codex 0.166.0 Release](https://github.com/openai/codex/releases/tag/rust-v0.166.0)

#### 发生了什么

0.166 新增 `codex queue --resume`，允许先向未加载线程排队消息并恢复执行；修复 resume/fork 后权限与已确认 approval 丢失、归档恢复后子线程消失、app-server 启停竞态，以及跨 resume/fork 的 reasoning-token 记账错误。后者会导致系统误判上下文接近上限并过早 compaction。

版本还把 standalone executor 放进标准 CLI/app-server 发布包，增加 `codex doctor --network-only`，并改善 TUI 断线恢复、安全阻断解释和 Markdown 问答呈现。与上期 0.165 的 Memory v2 / attached fork 相比，这次的增量不是“再加一种长期状态”，而是让已有状态在恢复、分叉、归档和重连后不悄悄变质。

#### 核心技术与 TA 工作价值

渲染技术任务往往跨越编译、GPU capture、平台复现与资产验证；中断后最危险的不是模型忘了聊天，而是**权限、工作树、附件、子任务和压缩计数分别恢复到不同时间点**。0.166 的修复说明一个成熟 Agent 工具链至少要保存四类状态：

1. 任务与消息队列状态；
2. 权限、approval 与安全策略状态；
3. 线程/子线程拓扑及附件；
4. 上下文预算与 compaction 记账。

对 TA 自动化，`queue --resume` 可用于把“编译完成后读日志”“Preview 完成后验页面”排到暂未加载的线程；`doctor --network-only` 适合把 GitHub、MCP、WebSocket 或代理问题与工程构建问题分开诊断。standalone executor 进入标准发行包，也降低 CLI 与 app-server 环境能力不一致的概率。

#### 限制与尝试方式

发布说明没有提供恢复成功率、长任务延迟或跨版本兼容基准；“状态被保存”也不保证状态仍然正确。权限和记忆越持久，越需要在恢复点重验 branch、HEAD、目标文件、用户授权范围与外部系统的最新状态。

**可立即尝试：** 给一条 UE Shader 修改任务设计恢复测试：在编译中断、线程归档、fork 后分别恢复；验证当前 branch/HEAD、已修改文件、附件、审批策略与待跑测试是否一致。把这些检查写进恢复后的第一步，而不是直接继续改代码。

**阅读成本与建议：** 10 分钟。先读 New Features 与 Bug Fixes；工具链维护者再追 `queue --resume`、权限恢复、descendant thread、app-server race 与 token accounting 对应 PR。

## 优先阅读顺序

| 优先级 | 内容 | 阅读成本 | 为什么先看 |
| --- | --- | --- | --- |
| 1 | GPU-Native Textured Mesh | 45–60 分钟 | 本期深读；从数据驻留、GPU 拓扑到接缝求解，给出完整可复现的管线设计与边界。 |
| 2 | MegaLights UE5.8 | 25–40 分钟 | 最容易立即转化为 UE 灯光审计和关卡预算；复杂度可视化尤其适合 TA。 |
| 3 | War Thunder × DLSS 5 | 10–15 分钟 | 一条很具体的 HDR/sRGB 集成教训，适用于所有插入色彩链路的神经图像阶段。 |
| 4 | PlaySR | 15–20 分钟 | 建立 MV 与 OF 的互补模型；当前公开性能信息不足，先读思想、暂缓排名。 |
| 5 | Codex 0.166 | 10 分钟 | 维护长周期 Agent/自动化者优先；只做短会话可快速浏览。 |

## 本周动手实验

**做一次“可逆色彩边界”测试。** 这是本周成本最低、对未来神经渲染集成最通用的实验。

1. 在 UE5 选一个同时包含高亮 emissive、饱和色、薄透明、雾、湿表面和 UI 的场景。
2. 从 scene-linear HDR 建立一条临时 Look 变换，输出模型可能使用的 sRGB / display-referred 图像；再实现对应逆变换，回到 linear HDR。
3. 不接任何 AI 模型，先测一次 round trip：`HDR → Look → InverseLook → HDR`。
4. 输出高光能量误差、RGB 相对误差、色相漂移、负值/超 gamut 像素比例，以及相机运动时的 temporal error。
5. 分别加入曝光、LUT、局部 tone mapping、Bloom 与 UI，找出第一个让链路不可逆的阶段；据此决定未来模型必须插在它之前还是之后。

这项实验建议先作为离线或开发构建工具，不冒充生产验证。若 round-trip 已经破坏高光或色相，后续任何模型对比都会混入色彩链路自身误差。

## 趋势观察

本周更明显的趋势不是“神经渲染取代传统渲染”，而是二者在管线边界处重新分工：PlaySR 用渲染器先验约束像素模型，DLSS 5 迫使色彩管理可往返，MegaLights 则把灯光复杂度压进固定采样与去噪预算。下一阶段的质量竞争会越来越依赖输入契约、颜色域、时序状态和调试可见性。

GPU 优化也从“某个 kernel 更快”转向“中间数据不离开设备”。全 GPU 纹理网格说明，只有当拓扑、清理、纹理和外观修正共享同一种驻留数据结构时，单阶段加速才会变成端到端实时。

Agent 工具链呈现相同规律：Memory、fork 与队列只是状态的来源，resume 后能否恢复权限、子线程、附件和上下文预算，才决定它能否安全接管长周期工程。

## 来源与核验

- 新闻窗口按 Asia/Shanghai 自然日计算：2026-10-31 至 2026-11-06；深读与补充最早回溯至 2026-10-24。MegaLights（10 月 28 日）与 Codex 0.166（UTC 10 月 29 日、上海 10 月 30 日）均标注为“上周补充”。
- GPU-Native Textured Mesh 以 arXiv v1、论文 HTML、项目页和官方仓库交叉核验。性能数字来自作者在 RTX PRO 6000 Blackwell Max-Q 上的实验；仓库许可证为非商业 source-available，不能按开源宽松许可证处理。论文图片使用 arXiv 非独占分发许可，未确认可再发布授权，因此本期没有转载原图。
- PlaySR 以 11 月 3 日 Sony Research 文章与作者页面核验。论文页在检索时要求浏览器验证，未能稳定读取全文；公开摘要未给出毫秒成本和硬件条件，本期明确保留这一缺口。
- War Thunder 条目只采用 NVIDIA 11 月 3 日对 Gaijin 的开发者访谈中的管线陈述。文章没有公开性能数据，且所述 Eagle's Shadow 更新当时尚未上线，因此不把未来交付或画质收益写成已验证事实。
- 已固定检查 [Unreal Engine 官方 YouTube 频道](https://www.youtube.com/@UnrealEngine/videos)：7 日窗口内的新上传是开发者访谈、学生作品和活动展示，没有达到本刊技术入选阈值；10 月 28 日 MegaLights 教学位于 14 日补充窗口，已纳入并核对官方文档。
- Codex 0.166 的日期与功能以官方 GitHub Release 为准；未采用 alpha 版本或第三方汇总。
- 已与 2026-W40 至 W44 的栏目主题去重：不重复上期的 DXR Clustered Geometry、Texture Consolidation、Honeycomb-Surfels、FSR SDK 2.4 和 Codex 0.165；0.166 仅写恢复可靠性的新增差异。本期不另发 Weekend Long Read。
- 检索截止时间：2026-11-06 09:02（Asia/Shanghai）。
