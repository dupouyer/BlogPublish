---
title: "GDC 地形专题 05｜笔刷、道路、河流、Biome 和 Decal：可重建世界生产链"
link: gdc-terrain-authoring
date: "2026-11-07 14:20:00"
description: "从生产源数据到地形高度、环境 Mask、植被和 Decal，一次解释开放世界非破坏性编辑与增量构建。"
tags: [GDC, Terrain, Houdini, Unreal Engine, PCG, Decal]
categories:
  - [笔记, 算法]
draft: false
catalog: true
cover: /img/posts/gdc-terrain-authoring/cover.svg
series: { id: gdc-terrain-engineering, stage: authoring, order: 5 }
prerequisites: [gdc-terrain-geometry]
difficulty: 深入
learningOutcome: "能为 Brush、Road 和 River 定义数据输出、依赖范围和缓存重建策略。"
---

**真正可维护的地形笔刷，不是会在地面写出一个圆形高度值，而是它能确定性地生产所有依赖地形的数据。** Wildlands 的道路、水文和村庄流程，以及三角洲的 Biome Recipe，都在回答同一个问题：如何让艺术家只编辑真正重要的输入，其余产物可以可靠重建？

![从地形笔刷到材质、植被、水体、Decal 和碰撞的生产数据流](/img/posts/gdc-terrain-authoring/cover.svg)

## 源数据应该保留规则，而不是只留下输出贴图

假设一条河流是中心线 Spline 加宽度、深度、纵坡和 Seed。它可以生成河床 HeightDelta、Wetness、Flowmap、植被排除区、水面 Mesh、岸边材质权重和泡沫区域。河流中心线属于权威数据；其他数据可重新计算。

~~~mermaid
flowchart TD
 A["River Spline + Width / Depth / Flow"] --> B["Height Delta"]
 A --> C["Wetness + Material Mask"]
 A --> D["Flow Vector"]
 A --> E["Vegetation Exclusion"]
 B --> F["Terrain Height + Collision"]
 C --> G["Terrain/Rock Shader"]
 D --> H["Water Shader / Foam"]
 E --> I["PCG / Foliage"]
 G --> J["RVT / SVT Rebuild"]
~~~

如果这些输出由不同团队分开手工维护，改一次河宽就容易出现河水流过草地、岸边岩石没有湿度、地形已下降但旧的碰撞仍在空中等问题。

## Brush 的数据契约

一个统一 Brush 可以输出多种数据，但不意味着必须制作一个包揽所有行为的巨型 C++ 对象。较稳妥的是将 Brush 描述与多个 Output Producer 分离：

~~~text
BrushDescriptor
  Id, Type, Version, WorldBounds
  Parameters, Seed, LayerPriority
  BlendModePerOutput
  SourceDependencyHashes

OutputProducers
  HeightDelta
  MaterialDistribution
  BiomeWeights
  Wetness / Flow
  VegetationExclusion
  Instances / Decals
~~~

Height 的 Add/Subtract、Min/Max、Replace/Lerp 与材质权重的归一化，不是同一种 Blend Operation。各输出需要自己的数据类型和合成规则。

## Mask 分类的依据是什么？

| 数据 | 生成方式 | 主要消费者 | 运行时需不需要 |
| --- | --- | --- | --- |
| Slope | Height 一阶差分 | 地表分配、植被规则 | 可以仅在构建期 |
| Curvature | Height 二阶差分 | 冲蚀、沉积、山脊分类 | 可以仅在构建期 |
| Flow Accumulation | 水文推导 | 河流与沉积生成 | 静态项目可离线 |
| Wetness | 水体、天气、洼地 | 地面、岩石、植被 | 多消费者时推荐共享 |
| Flow Velocity | 河道 Spline、流场 | 水面、泡沫、粒子 | 水体实时采样 |
| Biome | 气候规则、区域笔刷 | 地表、实例、季节 | 可能被派生后丢弃 |
| Road Distance | 道路 Spline | 路肩、材质、排除 | 静态区域可烘焙 |
| Grass Coverage AO | 地面植被点 | 地面假阴影 | 可烘焙为贴图 |
| Surface Type | Material ID/物理约定 | 脚步、轮胎、玩法 | 必须允许玩法查询 |

不要简单把剩余字段都塞进一个 RGBA。Wetness 是连续值，Material ID 是离散索引，Flow 是带坐标系的向量，更新频率与采样过滤都不同。

## 道路：生成器不只是 Spline Mesh

Wildlands 的自动路网生成考虑地形成本、方向、坡度和障碍，并将路径结果转化为可施工的道路。一个教学成本函数：

$$
C = aL + b|\Delta h| + c\max(0,s-s_{max})^2+d\,TurnPenalty.
$$

路径搜索的状态应包含入射方向，否则相同网格点不同入射方向可能对应不同后续转弯成本。道路中心线还需要曲率平滑、纵坡限制、路肩宽度、桥梁/隧道判断；最后输出 HeightDelta、Road Weight、Exclusion、标线/护栏实例等。

## 河流：不要只把 Height 减几米

河道的床面高度受目标水位、纵坡、断面形状、岸坡和河弯影响。可用中心线距离 d 构建一个平滑区域权重：

$$m(d)=1-\mathrm{smoothstep}(w/2,w/2+b,d),$$

并用它局部插值到目标床面：

$$H'=(1-m)H+mH_{riverbed}.$$

公式是可复现的教学模型。真实河流还需要上下游连续性、流速方向、分支交汇、水面 Mesh、桥梁和地表水文检查。

## Biome Recipe：同一笔触的多平台输出

一个沼泽 Recipe 可以同时包含泥土层权重、Wetness、草密度、树木健康度、颜色 LUT 选择和局部水花 VFX。PC/Mobile 继承同一片区域的语义，但可生成不同数量的点、不同远景资产和阴影策略。

这里还可以将三角洲的植被假阴影关联到数据系统：将草地分布生成 Ground Coverage/AO Mask，地形读取后呈现草地接触遮蔽，即使低端草 Mesh 不产生 CSM 阴影，也不至于看起来悬浮。

## Decal 必须区分四级影响

| 级别 | 所改变的量 | 能否改变地形碰撞 |
| --- | --- | --- |
| L0 | BaseColor、Normal、Roughness | 否 |
| L1 | 写入 RVT 的复合 PBR 结果 | 否 |
| L2 | 供渲染端 Displacement 读取的微观 Height | 不自动 |
| L3 | Heightfield 的真实 Terraform 高度 | 可以，在重建碰撞后 |

一条车辙如果只需泥印，则 L0 或 L1 足够；如果高画质希望掠射角看见凹槽，可以 PC 用 L2；如果载具轮胎要真实进入沟槽，就需要 L3 或专门物理几何。**RVT 保存了 World Height 不等于它自动更新 Landscape Collision。**

静态大面积 Decal 适合评估写入 RVT，短生命周期高频动态贴花则需要评估页面反复失效的成本。

## 增量构建：从 Bounds 到依赖图

假设地形高度编辑发生在 50×50 米范围。它可能影响附近法线与曲率、邻接材质边界、植被贴地和碰撞，但河流上游/下游的水文变化范围可能远远超出 Brush Bounds。

~~~text
Height Edit
 -> local derivatives + material rules
 -> terrain geometry & collision tiles
 -> anchored vegetation instances
 -> RVT Page invalidation
 -> mark SVT bake and Vista data dirty
 -> downstream flow analysis (possibly nonlocal)
~~~

每个派生输出最好保存生成器版本、输入 Hash、世界 Bounds 与受影响 Tile ID。地形编辑不能仅靠 UE Asset Dirty 标记维护所有 HDA、Mask 与离线远景贴图。河流依赖原始高度又修改地形高度时，还应明确“先分析基础高度、再做 Terraform”的阶段关系，避免循环求值。

## UE5.4 的一条最小生产验收链

从一个 2 km 山谷出发：

1. 用 Landscape Edit Layers / Blueprint Brush 或 Houdini HDA 制作基础 Height。
2. 增加一条 River Spline，输出河床、Wetness、Flow 和植被排除。
3. 让路边/河边地表用双 ID+Weight 进行材质融合。
4. 地形和岩石使用相同 Wetness 数据，水体与粒子使用同一 Flow Vector。
5. 修改河道后检查地形、草点、碰撞、RVT 与远景 SVT 的更新或失效标记。

成功标准并不是“一张河流效果图好看”，而是**重复输入可得到同样输出，局部修改不会让其他系统留下旧数据**。

## 原始资料

- [Wildlands GDC 2017](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf)
- [Delta Force GDC 2025](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta%2BForce%2BPerformant.pdf)
- [Frostbite GDC 2023：From Battlegrounds to Fairways](https://www.gdcvault.com/play/1029086/From-Battlegrounds-to-Fairways-Terrain)
