---
title: "TA 技术周报 · 2026-W43：透明判断前移到 RTU，物理动画压进低维空间"
link: ta-weekly-2026-w43
date: "2026-10-23T08:55:36+08:00"
description: "本期深读 Arm 在 Mali G2 上用 Opacity Micromap 降低 UE5 植被光追阴影成本，并关注 RL 肌肉、低维软体皮肤、结构引导视频生成与 XR Agent 测试。"
cover: "/img/posts/ta-weekly-2026-w43/cover.webp"
catalog: true
draft: false
excludeFromSummary: true
categories: [周刊]
tags: [周刊, UE5, Ray Tracing, Foliage, GPU, DCC, XR, AI Agent]
newsletter:
  kind: digest
  issue: 2026-W43
  periodStart: "2026-10-17"
  periodEnd: "2026-10-23"
---

## 本周速览

本期覆盖 2026-10-17 至 2026-10-23，五项内容都落在主窗口内。共同主线不是“再堆更多算力”，而是**把昂贵判断移到更合适的阶段，把运行时状态压缩到真正影响画面的自由度**：Opacity Micromap 在加速结构内预判植被微三角形的透明状态；RLMuscle 先在一维肌肉代理上学习激活，再把结果交给三维体积求解；PhysSkin++ 用低维仿射手柄承载连续软体变形；SolarRenderer 把 50 步生成蒸馏为 4 步；GenXR-Bench 则把 Agent 的 XR 结果从“能编译”推进到可执行的具身测试。

本期深读 Arm 在 Unreal Engine 5.6.1、Moku Central Garden 和 Mali G2 上的 Opacity Micromap 实测。它对密集植被尤其有价值：收益并非来自减少显存流量，而是让 RTU 在遍历阶段跳过几乎全部非透明三角形命中，避免反复回到 Shader Core 执行 Any-Hit/材质透明测试。

## 精选新闻

### 1. 深读｜Opacity Micromap：把植被透明测试前移到 RTU，UE5 MegaLights 实测最高提速 31%

- **来源 / 作者**：Arm；Patrick Wang、Felipe Lira
- **原始发布日期**：2026-10-22
- **原文**：[Reducing ray traced shadow costs for foliage with Opacity Micromaps: Moku results on Arm Mali G2](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/reducing-ray-traced-shadow-costs-for-foliage-with-omm-moku-results-on-arm-mali-g2)
- **规范 / 参考实现**：[VK_KHR_opacity_micromap](https://registry.khronos.org/vulkan/specs/latest/man/html/VK_KHR_opacity_micromap.html) · [NVIDIA Opacity Micro-Map SDK](https://github.com/NVIDIAGameWorks/Opacity-MicroMap-SDK)
- **主题**：UE5.6、Hardware Ray Tracing、Foliage、Masked Material、MegaLights、Mobile GPU

**发生了什么**

叶片、草和铁丝网常用少量三角形加 Alpha Mask 表达轮廓。普通硬件光追遍历只能看到承载贴图的粗三角形：射线击中它后，管线必须离开固定功能遍历，回到 Shader Core 读取 UV、采样 Alpha 并运行 Any-Hit；若像素其实落在叶片卡的透明空洞里，还要返回 RTU 继续寻找下一次命中。密集植被会把这个往返放大成大量 Continuation、Box Test 和无效材质求值。

Opacity Micromap（OMM）把这项判断预烘焙进光追加速结构。Baker 读取 Mesh、UV 与 Alpha，将每个基础三角形递归细分为最多 `4^L` 个微三角形，并把每个微三角形标为四种状态之一：

```text
Opaque / Transparent / Unknown-Opaque / Unknown-Transparent
```

明确透明的区域可由 RTU 直接忽略，明确不透明的区域可直接视为候选命中；只有跨越 Alpha 边界、被标为 Unknown 的微三角形才回到 Shader 执行精确测试。它不是改进 Alpha Blending，而是为 **Alpha Test / Masked Geometry 的光追可见性**提供硬件可消费的保守分类。

**核心技术与新意**

Arm 基于 NVIDIA RTX Branch 的 UE 集成继续补上 Vulkan RHI、Android/移动端和 Mali 所需改动，并在 UE 5.6.1 的 Moku Central Garden 中启用 SM6 与 MegaLights。对 UE 使用者，有三个实现点最值得注意：

1. **OMM 与材质求值模式必须成对看**。`r.MegaLights.HardwareRayTracing.EvaluateMaterialMode=0` 不做材质求值，若没有 OMM，Masked 轮廓可能退化为承载卡片的矩形；模式 1 用 Inline Ray Tracing 求值，模式 2 另行 Retrace。OMM 既可在模式 0 恢复轮廓，也可在模式 1/2 减少真正需要材质判断的 Unknown 区域。
2. **细分级别是质量—体积旋钮**。提高 `L` 会用更小微三角形贴合 Alpha 边界，降低 Unknown 占比，却同时增加烘焙尺寸、显存、构建与加载成本。正确策略不是一律最大，而是按植被卡片的屏幕密度、Alpha 边缘复杂度与阴影误差选择最低可接受级别。
3. **移动端优先 FastBuild**。Arm 建议为 BLAS 和 Micromap 都使用 Fast Build 取向，降低加载、Streaming 与重建成本；Fast Trace 可能交换来更大的结构与更重的构建，未必适合内存和功耗受限设备。

七个测试机位的平均帧率变化如下：

| 机位 | 无 OMM | 有 OMM | 提升 |
| --- | ---: | ---: | ---: |
| Ref 0 | 23.86 FPS | 27.51 FPS | 15.3% |
| Ref 1 | 24.77 FPS | 28.71 FPS | 15.9% |
| Ref 2 | 23.52 FPS | 30.82 FPS | 31.0% |
| Ref 3 | 31.39 FPS | 33.23 FPS | 5.9% |
| Ref 4 | 26.54 FPS | 31.78 FPS | 19.8% |
| Ref 5 | 22.44 FPS | 26.50 FPS | 18.1% |
| Ref 10 | 23.30 FPS | 29.64 FPS | 27.2% |

Ref 10 的 Streamline Profile 更能解释原因：GPU Active Cycles 从 428M 降至 365M（-14.7%），Compute Queue Cycles 下降 20%，但 Memory Traffic 变化不足 3%；与此同时 Non-opaque Triangle Hits 从 8.6M 降到 0.01M（-99.9%），RT Tester 总周期下降 38.4%，RTU Active Cycles 下降 66.8%，Resumed Ray Messages 下降 72.1%。也就是说，主要收益是**减少遍历—着色器之间的控制流往返**，不是省下一次纹理带宽就结束。

文中 Triangle Tester Issues 反而从 27M 增至 41M。合理解释是 RTU 不再被透明命中和恢复消息拖住，因而能推进更多真正有用的三角形测试；这是对计数器组合的推断，不是“单项计数越低越好”。分析 OMM 时应同时看 Active Cycles、Unknown 命中、Resume 消息和最终帧时间，而不是挑一个指标下结论。

**TA 实践价值**

最适合的资产是密集叶簇、草地、Cutout Fence、睫毛/毛发卡等“粗三角形覆盖大量透明区域”的几何。UE5 项目可以先做资产分桶：统计 Masked 材质的 Alpha Coverage、边界长度、射线命中频度与是否动态改变 Opacity；只给高频、可烘焙、边界相对稳定的卡片生成 OMM。对于全不透明场景、极少被射线击中的远景、会实时改变 Alpha 的溶解材质或真正的半透明玻璃，OMM 的收益很小或不适用。

生产侧还要把 Micromap 当成 Mesh 派生数据：它依赖拓扑、UV、Alpha Source 和 Cutoff，任一变化都应使 DDC/Build Cache 失效；LOD 或 Nanite Fallback Mesh 也不能默认共享同一数据。建议把 `Unknown 比例、Micromap 字节数、Build 时间、RTU Active、Any-Hit/Resume 数` 做成自动化资产报告，否则很容易用过高细分换来不可见的边界精度。

**限制与阅读建议**

- Unreal 主线在该实验时并未开箱支持 OMM；Arm 使用的是基于 NvRTX 的分支与自有 Vulkan/移动修改，不能把结果等同于任意 UE 5.6 Android 项目勾选一个选项即可获得。
- 测试集中在 Moku 的高植被覆盖画面和 Mali G2；桌面 GPU、不同 RT Pipeline、材质复杂度与场景遮挡会改变收益。最高 31% 是特定机位，不是项目预算承诺。
- 烘焙只适合可稳定分类的 Opacity。频繁变化的风动几何本身通常仍可复用 OMM，但若 Alpha 内容、Cutoff 或 UV 动态改变，就需要保守 Unknown 或重建。
- 阅读成本约 35–50 分钟。先看工作原理图和 `EvaluateMaterialMode`，再读七机位表与 Ref 10 Streamline 计数器，最后看 Subdivision Level、FastBuild 和集成限制。Arm 博客及 NVIDIA 仓库中的图片未能确认独立的可转载授权，本期不复制原图。

### 2. RLMuscle：先在一维肌肉上学激活，再驱动 194 块三维体积肌肉

- **来源 / 作者**：Chunlei Li 等
- **原始发布日期**：2026-10-22（arXiv v1 为 2026-10-21 16:57 UTC，换算上海日期）
- **原文**：[RLMuscle: Learning Muscle Activation for Physics-Based Character Animation](https://arxiv.org/html/2610.30033)
- **项目页**：[RLMuscle](https://chunleili.github.io/project-page-rlmuscle/)
- **主题**：DCC、Character Simulation、Reinforcement Learning、XPBD、Multigrid、USD

**发生了什么**

传统肌肉模拟的瓶颈往往不是有限元本身，而是“每一块肌肉何时激活、激活多少”。手工为数百块肌肉画激活曲线成本高，单纯从骨骼姿态反求又是高度冗余的逆问题：许多不同协同激活都可能产生相似动作。

RLMuscle 把控制和形变分两层。上层在廉价的一维 Hill-type Muscle Model 上用 PPO 学习逐肌肉激活，策略同时接收目标动作状态，并用 EMG 先验偏向更接近真人的募集模式；下层把同一套 Hill–Millard 本构写成三维四面体肌纤维约束，交给 GPU XPBD 求解。这样 RL 不必在每个训练步里承担完整三维软组织成本，三维求解也不必自行发现高层控制策略。

**核心技术与新意**

- 一维代理和三维肌肉共享关键生理曲线，减少从控制模型迁移到体积模型时的语义断裂；EMG 不是直接驱动最终网格，而是给冗余控制解提供先验。
- 体积系统使用 Petrov–Galerkin 几何多重网格：细层保留碰撞和局部形变，粗层吸收低频误差；层间由四面体笼的重心关系构造 Prolongation/Restriction。
- 项目页报告 194 块肌肉的全身模型在 RTX 4090 上模拟约 18 ms/帧，其中碰撞约 11 ms、其余约 7 ms；加入 USD 导出后约 32 ms/帧。这个数字证明接近交互制作速度，但不等于游戏帧内还有足够预算。

**TA 实践价值**

它更像一个 DCC 预计算/动画增强器，而不是当前即可嵌入 UE Tick 的角色组件。可落地的第一步是把学习到的 Muscle Activation 烘焙成随时间变化的低维通道，再驱动 UE 中的 Morph、Deformer Graph、ML Deformer 辅助输入或离线 Geometry Cache；碰撞密集镜头才回到体积解算。这样既保留“控制来自物理/生理约束”的价值，又避免把 18 ms 求解硬塞进完整渲染帧。

**限制与阅读建议**

每个角色仍需要带纤维方向的四面体肌肉资产、骨骼附着、碰撞层和训练环境；EMG 到具体角色的映射也不是自动免费获得。项目页虽展示代码/资产入口，本期未确认一份足以判断生产集成边界的明确许可证，因此不把它表述为可直接商用。阅读成本 35–50 分钟：先看系统 Pipeline，再读控制器与 EMG 先验、三维 XPBD 约束、多重网格，最后核对 18/32 ms 的测量口径。

### 3. PhysSkin++：连续神经蒙皮场扩展到接触、控制、3DGS 与 Rig 补形

- **来源 / 作者**：Zhejiang University 等
- **原始发布日期**：2026-10-19
- **原文**：[PhysSkin++: Physics-Based Skinning Fields for Generalizable and Real-Time Dynamic Deformation](https://arxiv.org/html/2610.26067)
- **项目页**：[PhysSkin++](https://zju3dv.github.io/PhysSkin_plus/)
- **主题**：DCC、Reduced Dynamics、Neural Skinning Field、Contact、3D Gaussian Splatting

**发生了什么**

PhysSkin++ 不是从零出现的新系统，而是对 2026 年 3 月 PhysSkin 的扩展。基础思路仍是 Neural Skinning Fields Autoencoder：Transformer 点云编码器从静态几何提取潜变量，Cross-attention Decoder 在任意三维查询点生成连续 Skinning Weights；训练不依赖每个对象的模拟轨迹或类别模板，而用势能、平滑与正交性等自监督目标塑造可用于动力学的低维场。

新版本真正值得关注的是它把表示推向了制作边界：加入 Dirichlet 边界控制和接触能量，将连续变形绑定到三角网格、点云与 3D Gaussian Splatting，并增加与传统 Rig 互补的目标，让低维物理形变承担骨骼动画不擅长的软组织与惯性响应。

**核心技术与新意**

高分辨率对象不直接求每个顶点位移，而由 `m` 个仿射位移手柄重建。每个手柄是 `3×4` 变换，因此动态坐标维度约为 `12m`，且 `m` 远小于顶点数 `n`。连续 Decoder 允许新采样点查询同一变形场：三角网格顶点、点云和 Gaussian Center 可共享表示；各向异性 3DGS 的 Covariance 则随局部仿射变换更新，而不只移动中心。

训练中多种自监督损失可能梯度冲突，方法结合在线归一化与 ConFIG 做冲突感知的梯度合成。这一点对 TA 工具很实用：若能量最小、权重平滑、基函数正交各自量纲不同，直接加权总损失常会让一个目标吞掉其余目标，不能只靠试一个固定 Loss Weight。

**TA 实践价值**

在 UE/DCC 中，它可作为“骨骼 Rig 后的低维物理解算层”：骨骼和动画师关键帧提供主运动，PhysSkin 类场负责腹部、脸颊、软道具、披挂或扫描资产的二次变形。对于 3DGS 数字人，连续场还能避免为每个 Gaussian 单独设计 Rig；同一局部仿射 Jacobian 同时更新位置与协方差，比只移动中心更能保住高斯形状。

**限制与阅读建议**

论文称可实时、可泛化，但这不等于已有 UE Runtime 插件；不同几何、接触数量、手柄数与硬件会改变实际毫秒数。公开的 `zju3dv/PhysSkin` 仓库对应早期 PhysSkin，本期未验证 PhysSkin++ 新增接触、3DGS 与 Rig 互补代码已经完整发布，也未确认仓库许可证，因此不要把论文功能与旧仓库状态混为一谈。阅读成本 35–45 分钟：先看图 2 和方法总览，再读连续场/低维坐标、Contact 与 Boundary、新增 Rig Complement 和 3DGS Binding，最后看跨类别实验。

### 4. SolarRenderer：结构控制不再绑定固定类型，50 步生成蒸馏为 4 步

- **来源 / 作者**：Solar Team 等
- **原始发布日期**：2026-10-21（arXiv v1 为 2026-10-20 17:59 UTC，换算上海日期）
- **原文**：[SolarRenderer: Universal Structure-Guided Video Generation](https://arxiv.org/html/2610.28630)
- **项目页**：[SolarRenderer](https://enderfga.cn/SolarRenderer/)
- **代码**：[Enderfga/SolarRenderer](https://github.com/Enderfga/SolarRenderer)
- **主题**：AI Video、Previsualization、LoRA、Distribution Matching、Streaming

**发生了什么**

结构引导视频常为 Depth、Pose、Canny、Segmentation 等每一种条件训练独立 ControlNet 或 Adapter。SolarRenderer 试图把条件类型本身改成自然语言：Blockout、语义图、带光照几何、人体网格等结构视频通过基础模型原生 Reference Path 输入，每个参考 Latent 使用目标帧的 RoPE；提示词说明“这段参考代表什么结构”，而不是依赖固定 Type ID。模型基于冻结的 MiniMax-H3 33B Ref2VA，只训练轻量 LoRA。

随后，作者用 Structure-guided Distribution Matching 把 50 步教师蒸馏为 4 步学生。流式版本采用 Block-causal 生成，项目页报告可按 17 帧 Chunk、每块约 0.70 秒推进 768p/24 fps，并落后输入约 1.1 秒。这里的“实时”指吞吐达到实时播放，不应误读为摄像机交互级的几十毫秒延迟。

**核心技术与新意**

- 条件视频复用原生 Reference 通路，避免每种结构都增设一套控制分支；目标帧 RoPE 保持结构帧与输出帧的时间对齐。
- 训练集包含约 13.6 万个帧对齐 Clip、8 类结构源；评估覆盖 16 种结构，其中 11 种训练未见，用来验证自然语言描述带来的开放类型泛化。
- 4 步模型相对 50 步报告 12.3× 加速。普通离线模型在单 GPU 上生成 158 帧、`1344×768` 仍约需 3.5 分钟；真正 24 fps 的是单独流式变体，不能把两组数字拼成“高分辨率离线模型也实时”。

**TA 实践价值**

对 TA 最实际的用途是把 DCC Blockout、Viewport Clay、Semantic Pass 或简化人体 Mesh 变成可快速评审的风格化动态样片，用于动作/镜头/氛围探索，而不是直接替代最终资产。若要纳入管线，应固定一组结构保真指标：轮廓漂移、接触点滑动、遮挡顺序、Camera Path 偏差和跨帧材质稳定性；只看“像不像电影”会掩盖对制作最致命的几何漂移。

**限制与阅读建议**

GitHub 代码为 Apache 2.0，但基础权重使用 MiniMax-H3 Community License，Hugging Face 页面列出地域限制；“代码开源”不等于权重在所有团队所在地都可部署。33B 基座、显存、输入预处理和长序列漂移也是实际成本。阅读成本 25–40 分钟：看方法图、Reference/RoPE 设计、四步蒸馏、未见结构类型评估与 Streaming Latency；部署前单独阅读代码和权重许可证。

### 5. GenXR-Bench：112 个任务检验 Agent 是否真的理解坐标系、异步传感器和双手交互

- **来源 / 作者**：Google 等
- **原始发布日期**：2026-10-21
- **原文**：[GenXR-Bench: Evaluating Coding Agents on Extended Reality Development](https://arxiv.org/html/2610.29014v1)
- **基础工程**：[google/xrblocks](https://github.com/google/xrblocks)
- **主题**：AI Coding、Agent Evaluation、WebXR、VR/XR、Embodied Testing

**发生了什么**

普通 Coding Benchmark 主要验证文本测试、编译或静态页面，无法覆盖 XR 的头手位姿、坐标变换、传感器生命周期和双手交互。GenXR-Bench 在 XR Blocks 0.21.0 / WebXR 上建立 112 个专家任务：24 个功能实现、21 个 Bug Repair、67 个完整应用生成，并为结果配置确定性 Kinematic Actor、可自适应的 VLM Agent、Scene Graph Assertion 与限定区域的视觉检查。

研究者还在消费级 XR 硬件上对 124 个候选应用进行了 372 次 Trial。自动测试与盲评专家达到 96.5% 一致，Flakiness 为 4.0%。在 10 组模型配置中，最佳总体 Pass@1 为 50.9%，SDK Feature 子集仅 29.2%，说明“能生成一个看似完整的 XR Demo”远不等于能正确处理底层交互契约。

**核心技术与新意**

失败分布比总分更有用：坐标变换错误占 64.4%，异步传感器初始化竞态占 44.9%，双手语义错误占 34.5%。这些问题往往能通过编译，也可能在单张截图里看起来正常，只有让测试 Actor 真正移动、抓取、切换输入并等待 Runtime Event 才会暴露。

测试体系因此分层：Scene Graph 负责结构性事实，Kinematic Actor 负责可重复的具身动作，视觉模型只检查难以结构化表达的局部结果；最后仍用真实头显核验自动环境没覆盖的 Runtime 和设备行为。这比让 VLM 对整张截图给一个“看起来对”分数更可审查。

**TA 实践价值**

UE 的 Agent 工具链可以直接借鉴测试维度，即使不复用 WebXR 实现：为 World/Local/Tracking Space 变换准备数值断言；用 Latent/Async Load/Permission Event 模拟传感器生命周期；把 Left/Right Hand、Grab State 和交互距离写成状态机；最后才加入固定机位的视觉对比和真机 Smoke Test。对于 Niagara、材质和 XR UI，Agent 输出的验收标准应至少包含“运行时序列”，不能止于资产存在或 Shader 编译成功。

**限制与阅读建议**

基准建立在 WebXR 与 XR Blocks，不是 UE Editor、Blueprint、OpenXR Plugin 或主机平台的直接评测；96.5% 一致也仍意味着边界案例要人工/真机复核。基础 XR Blocks 仓库为 Apache 2.0，但具体 Benchmark 资产和发布状态应以论文链接为准。阅读成本 25–35 分钟：先看任务分类与测试架构，再看表格中的总体/Feature 分数，最后读三类高频失败和 Hardware Validation。

## 优先阅读顺序

| 优先级 | 内容 | 阅读成本 | 为什么先看 |
| --- | --- | --- | --- |
| 1 | Arm OMM × UE5 MegaLights | 35–50 分钟 | 有真实 GPU 计数器、UE 参数和资产约束；最容易转化为植被光追预算实验 |
| 2 | PhysSkin++ | 35–45 分钟 | 把连续场、低维动力学、接触和 3DGS 连接起来，适合 DCC/Deformer 方向 |
| 3 | RLMuscle | 35–50 分钟 | 展示“低成本控制代理 + 高保真体积求解”的清晰分层，但资产门槛高 |
| 4 | GenXR-Bench | 25–35 分钟 | 能立即改进 XR/UE Agent 的验收设计，尤其是坐标系和异步生命周期 |
| 5 | SolarRenderer | 25–40 分钟 | 适合预演与结构驱动内容探索，但部署许可、显存和几何漂移需先评估 |

## 本周动手实验

建议立即做一个 **Masked Foliage 的 OMM 可行性审计**，先测“哪些资产值得烘”，不要先移植完整分支。

1. 从代表关卡抽取 20–50 个高命中植被 Mesh，离线读取 Alpha Mask，在 UV 三角形内按 `L=2/3/4/5` 细分并分类 Opaque、Transparent、Unknown。
2. 对每个 L 记录 Unknown 比例、估算 Micromap 字节数与轮廓误差；把结果按资产画成 Pareto 曲线。若提高一级细分只减少极少 Unknown，就停止加密。
3. 在现有 UE 光追 Capture 中记录 Masked Any-Hit/材质求值次数、RTU Active、Resume/Continuation、BLAS 大小和帧时间。没有 OMM 计数器时，可先以“Alpha Test 被调用次数 × 平均成本”估算收益上限。
4. 分别测试静态 Alpha、风动 WPO、动态 Cutoff/溶解三组。WPO 改位置通常不必改变 Micromap 分类；Alpha 内容或阈值变化则可能使烘焙失效，这是资产标记必须表达的差别。
5. 成功标准不是最高 FPS，而是：在目标画质下 Unknown 显著下降、Shadow Silhouette 无可见破损、Micromap/BLAS 增量可控、Streaming 与构建时间不恶化到抵消运行时收益。

这是预审实验，不是本站已经完成的 UE 实测。即使项目当前没有可用 OMM Runtime，它也能提前识别哪些植被 Alpha 版式浪费射线工作，并指导美术重排叶片卡、减少透明空洞或拆分高/低价值资产。

## 趋势观察

本周的共同趋势是**把运行时不确定性变成预计算或低维状态**。OMM 把 Alpha 可见性烘进 RTU 可读的微三角形分类；PhysSkin++ 与 RLMuscle 把海量顶点/肌肉响应拆成低维控制和高保真求解；SolarRenderer 用蒸馏把迭代步数压缩。下一阶段的竞争点会从“模型/网格有多大”转向“哪些判断能提前做、哪些自由度必须保留”。

Agent 工具链也开始面对同一问题：GenXR-Bench 表明编译和截图不足以代表运行时正确性。对 UE/XR Agent，更可靠的方向是把坐标系、异步生命周期、具身动作和视觉结果分别做成可重放断言，再由真机测试封顶，而不是用一个总分掩盖错误来源。

## 来源与核验

- 检索截止：2026-10-23 08:55（Asia/Shanghai）。新闻主窗口为 2026-10-17 至 2026-10-23；本期五项均在主窗口内，没有用近两周补充凑数。
- 论文日期以 arXiv Submission History 的 UTC 时间换算上海自然日；博客日期以原站页面为准。性能数字保留原作者的硬件、分辨率、场景与测量口径，不外推为 UE 项目的预期收益。
- 已固定检查 Epic Games / Unreal Engine 官方 YouTube 频道过去一周可确认的新内容；没有发现发布日期、来源和技术密度都足以进入前五的新视频，因此未为固定检查项占位。
- 已与本站 W40–W42 的 15 个主题和 URL 去重。Advanced Shader Delivery 虽在本周出现跨硬件发布进展，但 W41 已覆盖同一选题，本期不重复。
- 原始技术图均核对授权。Arm 博客、RLMuscle/PhysSkin++ 项目页及论文、SolarRenderer 示例资产的独立转载授权未能明确确认，因此本期没有复制这些图片；封面为本站使用 AI 生成的编辑插图，作为 `/img/posts/ta-weekly-2026-w43/cover.webp` 随文章提交。
- 本期未另发 Weekend Long Read；深读已合并在第 1 项。
