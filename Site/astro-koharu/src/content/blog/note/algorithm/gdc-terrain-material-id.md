---
title: "GDC 地形专题 02｜143 种地表材质如何进入一个 Shader？Material ID 与三材质混合"
link: gdc-terrain-material-id
date: "2026-11-07 14:05:00"
updated: "2026-11-07"
description: "从 Wildlands 单 ID/四邻域到三角洲双 ID+Weight、ID Fixing、Array 寻址与混合公式，附 WebGL2 交互实验。"
tags: [GDC, Terrain, Rendering, Unreal Engine, Shader, PBR]
categories:
  - [笔记, 算法]
draft: false
catalog: true
math: true
interactive: true
cover: /img/posts/gdc-terrain-material-id/cover.svg
series: { id: gdc-terrain-engineering, stage: material, order: 2 }
prerequisites: [gdc-terrain-architecture]
difficulty: 深入
learningOutcome: "能实现 ID 整数解码、Texture2DArray 查表与两种混合，并解释三角形最多三个材质的离线约束。"
---

Wildlands 的地表库有 143 种材质，却不需要在同一个 Shader 图里绑定 143 组 Albedo/Normal。核心不是“循环采样所有材质”，而是**全局 Material ID、局部纹理缓存 Slice、最终参与混合的少数材质**三者分开。

三角洲在此基础上更改了数据表达：用双 ID + Weight 保留艺术家指定的覆盖比例，再做离线 ID Fixing，令一个三角形最多出现三个独立材质。下面按数据流推导，而不是把“层数”误当“采样次数”。

## 先操作实验：看四种编码如何改变边界

<iframe class="article-lab-frame" src="/img/posts/gdc-terrain-material-id/lab.html" title="GDC Terrain WebGL2：单 ID、四邻域 ID、双 ID/Weight" loading="lazy" style="width:100%;height:700px;border:1px solid #40516c;border-radius:12px;background:#101924;"></iframe>

[独立打开 WebGL2 实验台](/img/posts/gdc-terrain-material-id/lab.html)。切换 `单 ID`、`Wildlands 四邻域`、`双 ID + Weight`、`三角形三材质教学版`，观察同一片地表产生的不同边界。调试视图分别观察 ID 与 Weight；几何生成已经移到第 04 篇的独立实验。浏览器实验只演示**颜色查表与混合**，不证明游戏实际 Shader 的性能。

![Wildlands 的原始 Material ID 分布图，伪彩色表示不同地表类别](/img/posts/gdc-terrain-material-id/wildlands-splat.webp)

图 1｜原稿第 33 页的 Splatting 图局部引用；亮色代表离散编号，并非最终地表颜色。来源：[Wildlands GDC 2017](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf#page=33)，© Ubisoft / 原作者。

## 一、为什么一张 R8 足够保存 143 个 ID？

R8 UNORM 存储一个 0–255 的整数码。对 ID 的无损恢复应在**关闭 sRGB、Point Sample 且采用正确整数解码**的前提下进行：

```hlsl
// UE5.4 Custom HLSL teaching sample.
// Source texture is R8 UNORM, sRGB off, Point.
float v = IDMap.SampleLevel(IDMapSampler, IDUV, 0).r;
uint globalID = (uint)floor(saturate(v) * 255.0 + 0.5);
```

第 143 个全局材质的编号可以是 142（0-based）。ID 贴图不能直接线性插值：ID 7 与 ID 42 之间出现 24.5 并不是“过渡材质 24”。**材质属性可以混合，材质索引不能像颜色一样混合。**

IDMap 的 UV 是覆盖整个地形的地图坐标；材质自己的细节纹理 UV 可以在世界空间以 0.1 m、0.5 m 等频率平铺。低分辨率 ID Map 不等于低分辨率 Albedo。

## 二、143 → 32：Indirection Table + Texture Array

Wildlands 演讲描述了全球 143 种材质与玩家附近约 32 层动态纹理阵列缓存的关系。概念流程：

```text
Global Material Library: 143 materials
       └─ determine nearby active set
Dynamic Cache: 32 resident material slices
       └─ update IndirectionTable[globalID] -> sliceID
Terrain Pixel: IDMap[worldXY] -> globalID
       └─ LUT lookup -> sliceID
       └─ Array.Sample(detailUV, sliceID)
```

Shader 绑定的是少量统一资源，而不是 143 个单独纹理输入。例如 `AlbedoArray`、`NormalArray`、`ORMArray`、`HeightArray` 各有 32 个 Slice。这是便于在 UE 复现的打包设计；实际属性格式以原始演讲为准。

```hlsl
// Simplified UE5.4 Custom node, Float3 output.
// IndexLUT: R8, Point/No sRGB; layer index in [0,31].
uint gid = (uint)floor(
  saturate(IDMap.SampleLevel(IDMapSampler, IDUV, 0).r) * 255.0 + 0.5);
uint lid = (uint)floor(
  saturate(IndexLUT.Load(int3(int(gid),0,0)).r) * 255.0 + 0.5);
float3 rgb = AlbedoArray.Sample(
  AlbedoArraySampler, float3(DetailUV, float(lid))).rgb;
return rgb;
```

这里是一个最小示意：引擎的 Texture2DArray、Mip、采样器类型必须与 Custom Node 实际输入对应；LUT 的第一维应至少有 143 个逻辑位置。真正的运行时 Streaming 还要保证 Slice 上传完成**之后**再让 LUT 指向新内容，避免映射到未初始化缓存。

**32 不是整屏最多 32 种可见材质。** 远景可以用预烘焙 Vista/SVT，不必同时保留远山所有原始 PBR 材质。反过来，如果真正需要高分辨率细节的近景活动区超过 32 种，必须增加局部限制、降级或缓存策略。演讲没有完整公开此超额情况的逐项处理算法，不能假设自动无上限。

## 三、Wildlands：四邻域 ID 对属性做双线性混合

令 ID 图的连续纹素坐标为：

$$ q=UV_\mathrm{ID}(W,H)-0.5,\quad b=\lfloor q\rfloor,\quad f=\operatorname{frac}(q). $$

在整数坐标 `b, b+(1,0), b+(0,1), b+(1,1)` 各取一个 ID，独立寻址对应的 PBR 属性 `M00...M11`：

$$
M(p)=\operatorname{lerp}\big(
\operatorname{lerp}(M_{00},M_{10},f_x),
\operatorname{lerp}(M_{01},M_{11},f_x), f_y
\big).
$$

简化成 HLSL：

```hlsl
float2 q = IDUV * IDMapSize - 0.5;
int2 b = int2(floor(q));
float2 t = frac(q);
// At each corner: point Load ID -> LUT -> Sample 2DArray.
// This function is a contract implemented separately.
float3 m00 = SamplePBRByTexel(b);
float3 m10 = SamplePBRByTexel(b + int2(1,0));
float3 m01 = SamplePBRByTexel(b + int2(0,1));
float3 m11 = SamplePBRByTexel(b + int2(1,1));
return lerp(lerp(m00,m10,t.x),lerp(m01,m11,t.x),t.y);
```

这个片段展示混合结构，**不是完整独立可编译的 UE Custom Node**：`SamplePBRByTexel` 需要按上一节实现，UV 边界要 Clamp/Wrap 处理，PBR Normal 不能简单把已归一化 RGB 法线和颜色按相同方式插值而不重归一化、转换基底。Roughness 具体混合模型也应根据项目目标决定。

这里“四份材质”并不等于“四次纹理读取”。每份 PBR 可能分别要读 Albedo、Normal、ORM、Height；陡坡多投影还会增加倍数。Wildlands 通过 VT 把复杂着色缓存起来。

## 四、三角洲：双 ID + Weight 如何保留绘制意图？

单 ID 的问题是：同一个 ID 纹素不能同时表达“泥土压在草地上，覆盖量 35%”。三角洲的编码概念是：

```text
BottomID = Grass
TopID = Dirt
TopWeight = 0.35
```

最初的材质属性可以写成：

$$ M=(1-t)M_B+tM_T. $$

进一步 Height Blend 可以从两种材质高度 `hB/hT` 调整权重。示意模型：

$$ t'=\operatorname{saturate}\left(\big[(h_T-h_B)+(t-0.5)S\big]K+0.5\right). $$

该结构对应三角洲第 66 页：$S$ 控制权重偏置的尺度，$K$ 控制锐度。材质高度的参考零点和范围需要一致；远景还会减弱高度差影响。**Height Blend 改变材质覆盖，不等于改变地形几何高度。**

原稿第 67 页的初始方案标注 **5-bit Bottom、5-bit Top、3-bit Weight**。这与下方为了演示 16-bit 完整利用而给出的 **5+5+6 教学方案**不同；不能把 6-bit 权重说成原项目公开编码。

教学示例：在 16 位里放两个 5-bit ID + 一个 6-bit 权重：

```hlsl
uint bottom =  packed        & 31u;
uint top    = (packed >> 5u) & 31u;
float t     = float((packed >> 10u) & 63u) / 63.0;
```

这是一种公开可实现的**教学编码建议**，不是对三角洲最终所有平台存储格式的逐字复刻。需要 143/256 个全局 ID 时，可以扩宽格式，或再引入局部 Palette/LUT。

## 五、为什么一个三角形能从六个候选变三个？

三个顶点，每点两个候选 ID，最多形成六种独立材质。三角洲第 70–74 页的 **ID Fixing** 在离线阶段限制每个三角形的 ID 并集：

1. 先把三个 Bottom ID 加入容量为 3 的集合。三个位置最多形成三种 Bottom，因此总能放下。
2. 集合还有位置时，按 Top Weight 从高到低尝试加入 Top ID；已存在的编号不重复占容量。
3. 放不下的 Top 在该点改成 Bottom ID，使该点不再引入额外材质。
4. 后续处理邻三角形仍只移除某点的 Top，而不引入新 ID，所以不会把已处理三角形的并集重新扩大。

例如三个点是 `(B=1,T=4,w=.8)`、`(B=1,T=5,w=.6)`、`(B=2,T=6,w=.2)`。先保留 `{1,2}`，再加入最高权重的 4；5 和 6 放不下，分别退回各自 Bottom。结果仍有三个点、六个字段，但独立编号只剩 `{1,2,4}`。

<iframe class="article-lab-frame" src="/img/posts/gdc-terrain-material-id/id-fixing.html" title="双 ID 离线 Fixing 与运行时权重恢复逐步动画" loading="lazy" style="width:100%;height:960px;border:1px solid #40516c;border-radius:12px;"></iframe>

[独立打开 ID Fixing 动画](/img/posts/gdc-terrain-material-id/id-fixing.html)。逐步观察 Bottom 集合、Top 排序、超额 Top 退回，以及修正后每个材质的三点权重。它使用固定小例子解释公开算法，不能代替对整张地图的邻接三角形烘焙验证。

![离线 ID Fixing 关键帧：三个点六字段，保留 ID 集合为 1、2、4](/img/posts/gdc-terrain-material-id/process-fixing.webp)

静态关键帧｜本文固定例子最终状态；超额 Top 已退回各点 Bottom。

之后 Pixel Shader 按三角形重心坐标 `λ0,λ1,λ2` 恢复各个材质的有效权重。对材料编号 `k`：

$$
W_k(p)=\sum_{i=0}^{2}\lambda_i(p)
\big([B_i=k](1-t_i)+[T_i=k]t_i\big).
$$

最后最多对三个不同 `k` 做纹理采样与混合。这个关键限制是在**离线阶段**实现，而不是希望 Pixel Shader 在六种材质中每帧做复杂的动态选择。

原 WebGL 实验的“三角形三材质”仍是每顶点单 ID 的重心示意，用于比较插值形态；上方新的逐步动画专门解释双 ID 的离线修正与权重恢复。两者职责不同。

## 六、需要解决的真正工程问题

| 风险 | 处理 |
| --- | --- |
| ID 经过 sRGB 或线性插值 | R8 UNORM / Point Sample / 整数 round-trip 测试 |
| mip 后出现不存在的 ID | 自定义 ID Mip/Clipmap，保证 ID 域规则，不能使用普通颜色平均 |
| 跨 Tile ID 缝 | 邻域采样读取邻 Tile 边界，预留 Border/Gutter |
| Array 层替换时闪烁 | LUT 更新有上传完成同步与保留期限 |
| 斜坡多投影成本 | 先判断投影，再做按材质的 PBR 采样；必要时缓存到 RVT |
| Height Blend 与真实位移混淆 | 分离 Coverage Weight 和 Displacement Height |
| 单三角形超出 3 类 | 离线 ID Fixing、分区 palette 与可视化违规热力图 |
| 手机端 half 精度 | 坐标、高度和整数索引用足够精度，检查边界 |

### 你可以在 UE5.4 做的四项验收

1. 生成 256 级 R8 ID 梯度，验证所有 ID 在 PC 和 Mobile 上往返一致，尤其使用 `floor(x*255+0.5)` 的路径。
2. 固定同一块地形，分别使用普通 Weight Layer、四邻域单 ID、双 ID 权重，对照输出 BaseColor/Normal/Roughness。
3. 用 Shader Complexity、RenderDoc 检查各路径真正的 PBR Texture Fetch，而不是统计材质候选个数。
4. 让邻接 Tile 使用不同的 Material Palette，检查每一个边界的 ID 查找、Mip 和 VT Gutter。

下一篇：[Texture Array、RVT、SVT 与 Clipmap 的区别和协作](/post/gdc-terrain-virtual-texture)。

## 参考资料

- [Ghost Recon Wildlands GDC 2017：Terrain Tools and Technology](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf)
- [Delta Force GDC 2025：Performant High-Quality Terrain and Biome Technology](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta%2BForce%2BPerformant.pdf)
- [Epic：Texture Asset / Texture Arrays / UE5.4 Materials](https://dev.epicgames.com/documentation/en-us/unreal-engine/textures-in-unreal-engine?application_version=5.4)