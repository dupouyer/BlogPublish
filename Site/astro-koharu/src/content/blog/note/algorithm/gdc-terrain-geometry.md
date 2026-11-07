---
title: "GDC 地形专题 04｜从 Landscape 到 CDLOD：网格 LOD 与真实 Displacement"
link: gdc-terrain-geometry
date: "2026-11-07 14:15:00"
updated: "2026-11-07"
description: "比较 UE Landscape、实例化规则网格与 CDLOD，区分基础 Height、材质 Height Blend、微观 Displacement 和碰撞。"
tags: [GDC, Terrain, CDLOD, Tessellation, Unreal Engine, Rendering]
categories:
  - [笔记, 算法]
draft: false
catalog: true
math: true
interactive: true
cover: /img/posts/gdc-terrain-geometry/cover.svg
series: { id: gdc-terrain-engineering, stage: geometry, order: 4 }
prerequisites: [gdc-terrain-virtual-texture]
difficulty: 深入
learningOutcome: "能区分网格密度、地形高度采样与材质微观位移，明确 CDLOD 的实际工程依赖。"
---

**地形网格的三个独立问题是：选择哪块网格、相邻精度怎样接起来、最终顶点沿哪份高度移动。** Wildlands 与三角洲在这些问题上做了不同取舍；只把一个 Grid 调密，无法解释它们的系统差异。

本篇先从唯一模板生成多个 Patch，再演示 CDLOD 选择、2:1 边缘 Morph、局部裁切、软细分和材质位移。第 03 篇已经解释数据怎么驻留；这里关注数据怎样变成可见的三角形。

## 一、先把两款游戏放在相同问题上比较

| 问题 | Wildlands 公开机制 | 三角洲公开机制 |
| --- | --- | --- |
| 世界分块 | Height / Splat / Vista 按四叉树组织，支持 LOD、裁剪与流送 | CDLOD 规则网格，按世界范围实例化 |
| 避免昂贵全通用 Shader | 按平地、陡坡与过渡区域划分处理 | 页面生成按材质复杂度选择路径，陡坡内容进入 VT |
| 近景加密 | Tessellation，材质高度参与 Displacement | CDLOD 继续细分到 LOD−1、LOD−2 等 |
| 减少实例浪费 | 不能从演讲推断为三角洲相同策略 | 保留父网格，裁去被更细实例替代的部分 |
| 高度来源 | 基础地形高度 + 材质级高度 | 软细分从 VT 高度取得更准确地形表面 |
| 材质微高度是否推动几何 | 原稿明确展示 | 不能仅凭 Height Blend 和软细分同时存在就确认 |

Wildlands 的四叉树存储与三角洲的 CDLOD 都能让近处更密、远处更稀，但“使用四叉树”不等于“使用同一个 CDLOD Renderer”。Wildlands 的平地/陡坡分类还涉及投影与 Shader 成本，不应和几何 LOD 选块混成一条操作。

## 二、独立几何实验：每一页回答一个问题

<iframe class="article-lab-frame" src="/img/posts/gdc-terrain-geometry/lab.html" title="实例网格、CDLOD、边缘拼接、软细分与材质位移动画" loading="lazy" style="width:100%;height:1080px;border:1px solid #40516c;border-radius:12px;"></iframe>

[独立打开几何实验](/img/posts/gdc-terrain-geometry/lab.html)。默认暂停，支持播放、单步、拖动进度与重置。材质位移页默认给出完整位移，先看轮廓，再尝试只改法线。

| 实验页 | 先做什么 | 应看见什么 |
| --- | --- | --- |
| 实例复用 | 播放或拖动进度 | 同一模板顶点映射到不同大小 Patch |
| CDLOD 选块 | 移动进度 | 相机移动后，小块与大块重新分布，覆盖面积不变 |
| 接缝 Morph | 进度从 0 拖到 100% | 奇数点收拢；剖面的红色高度差消失 |
| 裁切与软细分 | 比较 2×2、4×4、8×8 | 子块范围缩小；模板顶点数不变；旧区被裁掉 |
| 材质位移 | 开关“只改着色法线” | 明暗可相似，真实轮廓和剖面却不同 |
| 两套路线 | 从加密阶段推进到材质高度阶段 | 采样点增加与额外微高度是两个独立变化 |

实验图是可定位的算法示意。三维部分真正生成并投影三角形，但使用 Canvas 绘制，不是原游戏或 UE 的 GPU 渲染性能测试。教学剖面与采样规则在正文逐项对应。

## 三、实例化复用的究竟是什么？

模板保存 $[0,1]^2$ 内的规则顶点 `GridUV` 和三角形索引。每个 Patch 实例只提供自己的世界原点、尺寸、LOD 和数据地址：

```hlsl
// 概念代码：世界单位为米；不包含实际 RHI / Instance Buffer 布局。
float2 xy = PatchOrigin + GridUV * PatchSize;
float2 uv = (xy - HeightWorldOrigin) * HeightUVScale;
float h = HeightTexture.SampleLevel(HeightSampler, uv, HeightMip).r;
float3 positionWS = float3(xy, h * HeightScale + HeightOffset);
```

一个 8×8-cell 模板具有 $(8+1)^2=81$ 个顶点和 $2\cdot8^2=128$ 个三角形。覆盖 16m 时顶点间距是 2m，覆盖 64m 时是 8m。**变化的是每个实例的世界范围，Vertex Buffer 和 Index Buffer 可以保持相同。**

实例化可以减少 CPU 提交和重复资源管理，但每个实例的顶点仍会执行高度采样和变换。阴影 Pass、实例数量、Height 驻留、视锥剔除与像素着色依然有成本。

## 四、CDLOD 先决定画哪些节点，再决定怎样连续过渡

CDLOD 的空间选择可从四叉树理解：一个父节点对应一块世界范围，它的四个子节点覆盖相同范围的四个象限。遍历时，远处保留父节点，近处继续访问子节点。

完整算法还利用节点的高度上下界做三维范围判断。仅用 `distance(cameraXY,nodeCenter)` 会忽略山顶、谷底与相机高度；实验为了把选块看清，采用二维到矩形的距离，明确不把它称作完整选择器。

无论采用何种选择策略，都要维持两个基本条件：

1. **覆盖完整。** 所需世界区域不能漏块；同一区域不要无意重复覆盖。
2. **过渡兼容。** 相邻块不能突然变成完全不兼容的顶点密度与高度表示。

动画“CDLOD 选块”记录叶节点的世界矩形；这些矩形面积之和始终为 1。它先展示选块责任，下一页才展示连续性责任，避免颜色变化掩盖真正的接缝问题。

### 裂缝为什么产生：不只因为边上多了一个点

假设粗边在 $y=0,2,4$ 有顶点，细边在 $y=0,1,2,3,4$ 有顶点。粗边在 0–2 之间是连接两个高度的直线；细边的 $H(1)$ 若偏离该直线，两侧就不共面。

即使所有点都读取同一张高度图，也不能保证 $H(1)=[H(0)+H(2)]/2$。因此“采样相同 Heightmap”本身并不能消除 T-junction 的几何裂缝。

实验下方画的是**同一共享边的两条折线**，不是两张没有空间关系的示意曲线。红色区域就是粗细两条边之间的几何差。

## 五、Morph 怎样把细网格退化成粗网格？

规则网格允许把奇数点逐渐推到前一个偶数点。对整数格坐标 $g$，单轴教学公式是：

$$
g'=g-(g\bmod2)\,m,\qquad m\in[0,1].
$$

$m=0$ 时保留全部细点，$m=1$ 时每两个点重合。相应的三角形退化，边界顶点集合与粗网格一致。二维实现可分别处理 XY；完整 CDLOD 的 Morph 因子由距离区间决定，不只是对一条边统一拖动。

一个关键次序是：**先计算 Morph 后的 XY，再按一致的高度定义采样高度。** 如果先取 $H(1)$，再把 XY 挪到 0，细点仍带着原来的高度，就可能形成竖直尖刺。

```hlsl
// 只解释 2:1 对齐；实际 CDLOD 还要处理距离带和节点选择。
float2 coarseGrid = floor(GridCoord * 0.5) * 2.0;
float2 morphedGrid = lerp(GridCoord, coarseGrid, Morph);
float2 xy = PatchOrigin + morphedGrid * GridStep;
float h = SampleCompatibleHeight(xy); // 两边必须遵守同一有效性与高度约定
```

动画末端同时检查“XY 是否收拢”和“共享边最大高度差是否接近 0”。这比只看到 Patch 颜色切换更能验证拼接的含义。

真实系统还需保证：相邻 LOD 选择不超出过渡策略、高度 Mip 采样兼容、Border 有效、位移幅度与边界一致。Skirt 可以遮部分裂缝，但不是 CDLOD 连续过渡本身。

![粗细边界 Morph 中间状态，红色区域是两条高度边之间的几何差](/img/posts/gdc-terrain-geometry/process-morph.webp)

静态关键帧｜本文教学模型的 Morph=0.5。上图观察点的位置，下图观察边界实际高度。

原始算法的距离范围、Morph 和节点选择细节见 [Filip Strugar 的论文与实现](https://github.com/fstrugar/CDLOD)。本文的单边动画仅提取其中最小可观察关系。

## 六、三角洲怎样避免为一个精细角落提交四个整块？

假设一个父 Patch 只有左上角需要更精细。常规替换可能移除整个父节点，再提交四个子节点；其中三个子节点其实没有精细需求。

三角洲公开的改进是保留父实例，让其被替代部分的顶点合并、三角形退化，再单独提交需要的细实例。这样可以保留父级的其余区域。

![三角洲的父网格局部裁切与子实例补充示意](/img/posts/gdc-terrain-geometry/delta-cutout.webp)

图 1｜原稿第 90 页局部技术图。重点是“保留父级其余区域”，不是把同一区域重复画两次。来源：[Delta Force，GDC 2025](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta+Force+Performant.pdf#page=90)，© 原作者 / 腾讯。

动画把过程拆成四个状态：原始父块 → 橙框内旧三角形被裁掉 → 更小的模板实例补入 → 父子组合完成。灰色网格是被移除区域的提示，不代表真实渲染还保留这些三角形。

局部裁切的重点是**减少无效实例或顶点处理**。它不自动解决新旧边界，也不意味着任何任意形状的洞都能靠一个布尔量免费裁掉。实例有效区、退化模式和连接规则需要一起设计。

![父 Patch 裁去局部区域后，用同一模板的细实例补入](/img/posts/gdc-terrain-geometry/process-tess.webp)

静态关键帧｜本文局部裁切模型的组合阶段；右侧是子模板放大图。

## 七、Software Tessellation 的 4×4，不应读成“模板变成四倍大”

三角洲把 CDLOD 继续向近处细分到更密层级，并比较了每次按 2×2、4×4、8×8 细分的代价。其演讲选择 4×4 来平衡误差和实例数量。

这描述的是**空间层级划分和选块策略**。它不要求把唯一模板从 16×16 cells 改成 64×64 cells。模板不变、世界 Patch 边长缩小，同样可以提高单位米的采样密度。

| 教学情形 | Patch 世界边长 | 模板 cells | 顶点间距 |
| --- | ---: | ---: | ---: |
| 父 Patch | 64m | 8×8 | 8m |
| 2 倍细分层 | 32m | 8×8 | 4m |
| 4 倍细分层 | 16m | 8×8 | 2m |
| 8 倍细分层 | 8m | 8×8 | 1m |

若把整个父区域全部替换，$r\times r$ 子区会需要 $r^2$ 个模板实例；只局部需要精细时，必须结合裁切和选区才能控制浪费。不能用“每个实例面数没变”推出总面数没增加。

![三角洲软细分选择图及不同细分策略的局部示意](/img/posts/gdc-terrain-geometry/delta-soft-tess.webp)

图 2｜原稿第 92 页局部引用，用于对照层级细分与裁切。来源同上，© 原作者 / 腾讯。本文不照搬原图中具有场景条件的误差百分比作为普遍结论。

还要纠正一个容易误传的边界：第 93 页明确说明该软细分在 **PC 出货**；移动端被认为可行，但当时没有完成出货。不能写成三角洲手机版已经采用了同一细分功能。演讲的 RTX 3080 性能对比仅代表其测试，不等于 UE 或本动画的成绩。

## 八、网格更密，为什么还不一定有碎石轮廓？

细分解决“哪里有采样点”，Displacement 决定“采样点往哪里去”。如果细网格仍然只读取平滑基础 Height，它不会自动长出材质里的每粒石头。

Wildlands 的材质资产包含微观高度，并展示它参与可见几何细节：

![Wildlands 材质位移的原始表面细节对照](/img/posts/gdc-terrain-geometry/wildlands-displacement.webp)

图 3｜原稿第 38 页局部效果图，观察接近地面的几何起伏与轮廓。来源：[Wildlands GDC 2017](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf#page=38)，© Ubisoft / 原作者。

把高度来源写开更清楚：

$$
P_{base}=(x,y,H_{terrain}(x,y)),
$$

$$
P_{final}=P_{base}+N_{base}\,A(d)\,[D_{material}(u,v)-D_0].
$$

$H_{terrain}$ 是基础地形，包含道路等 Terraform；$D_{material}$ 是可平铺材质高度；$D_0$ 是零位移基准；$A(d)$ 控制幅度与距离衰减。位移方向 $N_{base}$ 可取约定的基底法线；动画为方便读剖面，沿世界 Z 位移。

### Height Blend、着色法线和 Displacement 要看不同证据

| 改变项 | 明暗 | 网格位置 | 轮廓 / 物理 |
| --- | --- | --- | --- |
| Height Blend | 改变材料覆盖与对应光照 | 不自动改变 | 不自动改变 |
| Normal Map | 改变着色法线 | 不改变 | 不改变轮廓 |
| 材质 Displacement | 随位移表面变化 | 明确改变 | 改变可见轮廓；物理不自动更新 |

在“材质位移”页，先看右侧起伏和下方剖面，再勾选“只改着色法线”。表面仍能保留细节明暗，但黄色边界回到平面；真实顶点高度范围也回到 0。这正是判断位移是否生效的可观察证据。

![同一材质 Height 对真实顶点和轮廓产生的位移，下方同时显示基础碰撞平面](/img/posts/gdc-terrain-geometry/process-displacement.webp)

静态关键帧｜本文生成的三角形与剖面，非游戏截图。灰线是未更新的基础碰撞面。

接着保持同样 Height 函数，比较 8×8 与 64×64 cells。较低密度错过细峰，较高密度捕捉更多细节；高频高度若超出网格采样能力，会产生跳动和欠采样。细分密度、Height Mip、位移频率和距离衰减应联动控制。

### 多材质位移不能与覆盖权重各走一套

两种材料若颜色按一组权重混合，高度却按另一组不连续选择，交界就可能出现台阶。共享边两侧还必须用一致的材质 ID、Height 采样、零位移和衰减规则。常见方案是先定义连续的混合高度，再让几何与着色读取兼容结果。

这不意味着所有 Height Blend 权重都必须照搬成几何权重；艺术表现可以不同，但不同必须是明确设计，不能由 LOD 或缓存读取差异意外产生。

## 九、数据来自 VT 时，几何路径还缺哪些保障？

顶点读取高度需要可用页。像素反馈未必能覆盖下一帧将出现的所有顶点，阴影相机、快速跨区和远处剔除范围也可能提出不同需求。

几何系统应明确高度的常驻粗级、预取范围、缺页回退及 Morph 兼容性。一个 Patch 回退到粗 Height，另一个仍取细 Height，即使 XY 已对齐也可能高度不同。位移 Bounds 还必须覆盖最大位移，否则剔除和阴影可能过早截断。

视觉碎石通常可以只改画面；会改变车轮通过性的沟坎，则应进入可查询的基础高度或专用碰撞几何。不能认为 WPO、Nanite Displacement 或 RVT Height 会自动更新 Landscape Collision。

## 十、放回 UE5.4：先选数据接口，再选 Renderer

Landscape 包含编辑层、Spline、碰撞、Foliage 和流送工作流；自研 CDLOD 降低提交成本的同时，也要重新接上这些消费者。只有确认瓶颈来自地形提交或几何路径，替换 Renderer 才有明确收益。

PC 可验证 Nanite Landscape 和实验性的 Nanite Tessellation，但仍要保留非 Nanite 数据服务其他系统。Mobile 则应单独确定网格预算、Height 驻留与材质路径，不能根据桌面实验直接宣布支持。

可以让 Landscape 与自研网格消费同一套世界坐标、Heightfield 和材质数据协议。这样替换 Renderer 时，不必重写下一篇要讲的生产工具：[Wildlands 分层生产、Mask、道路与实例整合](/post/gdc-terrain-authoring)。

## 参考资料

- [Filip Strugar：CDLOD 原始论文、示例和实现](https://github.com/fstrugar/CDLOD)。
- [Wildlands GDC 2017](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf)：第 19、35、38、47–51 页。
- [Delta Force GDC 2025](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta+Force+Performant.pdf)：第 89–93 页。
- [UE5.4 Nanite 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.4)。
