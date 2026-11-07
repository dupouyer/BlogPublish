---
title: "GDC 地形专题 04｜从 Landscape 到 CDLOD：网格 LOD 与真实 Displacement"
link: gdc-terrain-geometry
date: "2026-11-07 14:15:00"
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

地形渲染中容易把三个变量混成一件事：**有多少顶点、顶点从哪里读取高度、材质的 Height 是否真的推动几何。**

![地形网格和微观置换的技术边界](/img/posts/gdc-terrain-geometry/cover.svg)

## 先做一个可操作的网格实验

<iframe src="/img/posts/gdc-terrain-material-id/lab.html" title="WebGL2 地形网格和置换实验" loading="lazy" sandbox="allow-scripts" style="width:100%;height:700px;border:1px solid #40516c;border-radius:12px;background:#101924;"></iframe>

[打开独立 WebGL2 实验台](/img/posts/gdc-terrain-material-id/lab.html)，切换到 Grid LOD 标签，改变 Cells、微观位移与观察角度。它会实际生成不同网格 Buffer；不是用多张图片切换。实验不实现原游戏的完整 Quadtree、LOD Morph、VT Page、Nanite 或碰撞。

## Landscape 是 Renderer，更是一套编辑器生态

UE5 Landscape 包含 Heightmap、Weightmap、Component/Section、Spline、碰撞、物理材质、关卡与 Foliage 集成。采用 Landscape 意味着可以直接复用这些工具，但也接受它已有的网格调度边界。

Nanite Landscape 是另一套 PC 可选渲染表示。UE5.4 的 Nanite Tessellation 仍带有实验性质，不能假设 Nanite 表示已替代传统 Landscape 的碰撞与 Water 等数据需求。

## CDLOD 的基本数据协议

三角洲 GDC 2025 介绍了基于规则 Grid Mesh 的 CDLOD Instancing。让一份固定模板网格覆盖不同世界范围，Patch Instance 决定其 Origin、Size、LOD：

~~~hlsl
// Concept only: actual RHI instance data and UV mapping omitted.
float2 xy = PatchOrigin + GridUV * PatchSize;
float2 heightUV = (xy - HeightWorldOrigin) * HeightUVScale;
float h = HeightTexture.SampleLevel(HeightSampler, heightUV, LodMip).r;
float3 posWS = float3(xy, h * HeightScale + HeightOffset);
~~~

网格固定为 32×32 Cells 时，近景覆盖 32 米、远景覆盖 128 米，都能复用相同的顶点索引与材质。Patch 的世界范围和 LOD 必须按实际误差与距离确定，上述尺寸只是示例。

**Instancing 降低 Draw Submission，但不保证地形 GPU 时间同步下降。** Vertex Texture Fetch、Shadow Pass、Patch 数量、可见性和 Tile Streaming 仍决定成本。

### 最难的不是画网格，而是保证连续性

相邻 Patch 的 LOD 不一致会产生 T-junction、裂缝和 Height 采样误差。完整实现至少需要：规则网格边缘约束、LOD 邻居一致性、Geomorph、视点移动滞回、Tile Bound、HeightMip 的世界一致性、裁剪和碰撞接口。

CDLOD 的 Continuous 不是简单的每距离翻倍 Grid Scale，而是过渡策略的一部分。

## 三角洲 Soft Tessellation 是更密的规则 Grid

它通过近景 LOD -1/-2 增加顶点密度，而不是强制使用老式 GPU Hull/Domain Tessellation。GDC 分享中对 2×2、4×4、8×8 的局部细分进行了比较，公开方案采用 4×4 的成本和质量折中。

以 16×16 的基础 Cells 为例：

| 细分倍数 | Cells | 三角形数 |
| --- | ---: | ---: |
| 1× | 16² | 512 |
| 2× | 32² | 2048 |
| 4× | 64² | 8192 |
| 8× | 128² | 32768 |

细分倍数增加 4 倍，网格三角形数量可增加 16 倍；所以局部精细范围、距离阈值、Instance Count 都非常重要。

## Wildlands 的 Material Displacement 为什么不同？

Wildlands 的近景 Tessellation/Displacement，不仅使用 Macro Terrain Height，还使用为每种地表材质制作的局部高度图，让岩块、泥地和碎石的微细几何真正改变轮廓。

两类高度要分开：

~~~text
H_base(worldXY)      -> 山体、道路、Collision 高度
D_material(detailUV) -> 可重复平铺的微观浮雕
~~~

可用教学公式表示：

$$
P' = P_{mathrm{base}} + N A(d) igl(D_{mathrm{blend}}-D_0igr).
$$

其中 D0 是零位移基准、A(d) 是距离衰减；多材质区域要让位移高度与有效的覆盖权重协调，以免材质接缝形成几何裂缝。

**三角洲的 Material Height 公开用于 Height Blend，CDLOD 软细分公开用于获取更准确的地形高度；不能仅凭两项同时存在就断言三角洲将各地表材质 Micro Height 以 Wildlands 的方式进入几何阶段。**

### Height Blend ≠ Displacement

Height Blend 改变 Bottom/Top 材质的覆盖比；Displacement 改变实际渲染顶点的位置。前者不会自动修改网格或碰撞。视觉的微观碎石位移一般也不应直接决定角色或车轮的碰撞；足以影响玩法的沟壑与路肩应该写入 Macro / Terraform Height。

## 陡坡的 UV 需要独立处理

XY 世界投影在接近垂直的岩壁上会拉伸。Triplanar 读取 X/Y/Z 三轴投影，Biplanar 只混合权重最大的两个方向；三角洲进一步研究单采样随机化选轴，用于 VT Page 合成。

对于所选 X 投影，采样 UV 为 yz，并应从连续的 WorldPosition 求梯度，而不是对随机跳变后的 UV 直接做隐式求导：

~~~hlsl
float3 p = WorldPosition * Tiling;
float3 dx = ddx(p), dy = ddy(p);
float4 c = Tex.SampleGrad(TexSampler, p.yz, dx.yz, dy.yz);
~~~

这是一个单轴示例，没有公开游戏的完整随机实现、法线坐标恢复或随机模式。**接近垂直的岩壁写入顶视 XY VT Page 会遭遇有效像素面积不足**，不能只靠无限增大 Triplanar 纹理分辨率解决。

## UE5.4 的实际选择

| 项目目标 | 起点 |
| --- | --- |
| 先保证编辑器、Spline、水体与碰撞 | Landscape |
| PC 高精度微观位移 | 小面积验证 Nanite Landscape Tessellation |
| Draw/Vertex 证实为主要瓶颈 | 专用 CDLOD Renderer 原型 |
| 洞穴、悬垂、桥洞 | Mesh/Nanite/其他非单值高度几何 |
| Mobile 地形 | 适当几何 LOD + Normal/Height Blend，按机型考虑视差 |

对同一地形测试 Direct Landscape、Nanite 和 Grid Instance 时，应固定数据、投影、视锥、阴影、像素数；报告 GPU Cost、Vertex Count、Draw Submission、Mip 与流送峰值，不能只报告面数。

下一篇：[笔刷、道路、河流、Decal 与增量构建](/post/gdc-terrain-authoring)。

## 参考资料

- [Ghost Recon Wildlands Terrain Tools and Technology (2017)](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf)
- [Delta Force Terrain and Biome Technology (2025)](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta%2BForce%2BPerformant.pdf)
- [UE5.4 Nanite Virtualized Geometry](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.4)
