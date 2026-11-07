---
title: "GDC 地形专题 03｜Texture Array、SVT、RVT 与 Clipmap 如何协作"
link: gdc-terrain-virtual-texture
date: "2026-11-07 14:10:00"
description: "区分源纹理、活动材质缓存、静态与运行时 VT、Clipmap 的不同职责，并讨论 VT 页面生成与失效。"
tags: [GDC, Terrain, Virtual Texturing, Unreal Engine, Rendering]
categories:
  - [笔记, 算法]
draft: false
catalog: true
math: true
cover: /img/posts/gdc-terrain-virtual-texture/cover.svg
series: { id: gdc-terrain-engineering, stage: streaming, order: 3 }
prerequisites: [gdc-terrain-material-id]
difficulty: 深入
learningOutcome: "能解释地形源数据、PBR 纹理驻留、RVT/SVT 页面与 Clipmap 的独立生命周期。"
---

假设世界已经有一份双 ID + Weight 的 Splat Map，下一步要回答的问题不是“要不要开启 VT”，而是：**哪种数据需要随机寻址？哪些需要离线预生成？哪些每次视点移动都会被更新？**

![地形数据存储与多级 GPU Cache 的职责边界](/img/posts/gdc-terrain-virtual-texture/cover.svg)

## 五种资源不在同一个层面竞争

| 数据机制 | 存储对象 | 核心职责 |
| --- | --- | --- |
| Height / Splat Tile | 地图空间中的 Height 与 ID/Weight | 原始或派生源数据 |
| Texture2DArray | 同类型 PBR 贴图的多个 Slice | 让 Shader 用一个纹理资源选择多种材料 |
| Clipmap | 围绕观察者的多级局部纹理窗口 | 近高远低、滚动更新大地图数据 |
| SVT | 离线构建的 Virtual Texture Page | 流送远景颜色、法线等静态结果 |
| RVT | GPU 按需生成的 Virtual Texture Page | 缓存复杂地表混合与静态贴花 |

Texture Array 的第三个坐标是 Slice ID；RVT / SVT 的重点是逻辑页面和物理页面的对应关系；Clipmap 则用不同世界尺寸的局部窗口组织空间分辨率。它们可以同时存在。

~~~mermaid
flowchart TD
 A["Height / Splat ID Tile"] --> C["Tile Streaming / Clipmap"]
 B["Global PBR Library"] --> D["Texture Array Active Set"]
 C --> E["RVT Composition"]
 D --> E
 F["Road / Static Decal"] --> E
 E --> G["Near RVT PBR Pages"]
 H["Offline Vista & Height Normal"] --> I["Far SVT Pages"]
 G --> J["Terrain Base Pass"]
 I --> J
~~~

此图是帮助分析的实现模型，不是某款商业游戏的原始源码。

## Clipmap 与普通 Mipmap 的根本区别

整张 8192² R8 的地图常驻内存需要 64 MiB（仅 Base Level）。但玩家身旁若只需要高精度的有限区域，可以让每级 Clipmap 固定保存 512² 之类的局部窗口：

- L0：例如每纹素 0.5 米，覆盖 256 米。
- L1：每纹素 1 米，覆盖 512 米。
- L2：每纹素 2 米，覆盖 1024 米。
- 更远的地方再交给低分辨率整图或其他远景缓存。

以上数值是举例，不是三角洲已公开的固定配置。相机移动时只上传进入新窗口的条带。典型设计采用 Toroidal Buffer，在逻辑世界坐标和环状物理纹理坐标之间转换，并对采样范围、上传完成与 LOD 过渡进行有效性检查。

需要注意 **离散 ID 无法依赖颜色贴图自动 Mip**：ID=7 与 ID=42 普通平均会得到无意义的中间编号。必须单独生成合法的每级材质 ID/Weight，或按约束挑选代表材质。

三角洲公开了两种语义不同的 Clipmap：Splat ID Clipmap（地表材质分布）和共享环境 Clipmap（健康度、Wetness、水流等）。两者更新频率、滤波和编码方式都不相同。

## SVT 可以保住远景的高精度法线

如果几何 LOD 过粗，山体小沟壑无法继续体现在顶点法线上。三角洲用离线烘焙的高精度地形法线保留细小光照变化，再通过 SVT 在远景取样。近处 RVT 和远处 SVT 使用兼容的法线定义，避免近远景出现可见接缝。

这提高的是**着色法线精度**，不是物理几何轮廓。SVT 的远景表现也不是必须每一层 PBR 都跟近景一样精细：若目标是高速移动 FPS，应优先确保 Color / Normal 的一致性与页面开销。

## RVT：重复做三种材质混合，还是合成一次？

复杂地表的 Base Pass 可能读取三种材质、法线、粗糙度、Height，再执行 Height Blend、投影和 Decal。RVT 把这些复杂处理合成到缓存页面，最终 Base Pass 改为读取缓存的 PBR 属性。

然而 RVT 需要页面绘制、Physical Cache 写入与反馈处理；当页面频繁失效时，额外成本可能超过直接做材质计算。

尤其应测试两种情况：高速驾驶跨 Biome 和 FPS 开镜瞬间改变 FOV。三角洲专门分享了页面请求和 Mip Bias 的控制。**不是所有场景启用 RVT 都更快，必须测页面生成峰值与复用率。**

其另一项重要优化是离线统计 Page 含多少材质，只包含一套就执行单材质 Shader，含两套才做两层，含三套再做三层。这个决定发生在 VT 页面生成任务级，不是 Pixel Shader 遍历整个材质库。

## 陡坡为什么倾向于在 RVT Pass 处理投影？

世界 XY 投影在陡坡上会拉伸。Triplanar 用三套投影混合，Biplanar 只选两个，三角洲研究了随机化选轴以用较少纹理采样减少接缝，再把结果写入 RVT。

但是以顶视 XY Page 缓存接近垂直的岩壁存在采样面积不足的问题。VT 页面越远或高度接近垂直，这个瓶颈越明显。演讲没有公开完整的随机投影算法，不能把简化 Hash 示例冒充原方案。

投影切换还会影响隐式 UV 导数，故在自定义 Shader 中可先对连续 WorldPosition 求梯度，再依所选轴构造 SampleGrad：

~~~hlsl
float3 P = WorldPosition * Tiling;
float3 dx = ddx(P), dy = ddy(P);
// X axis selected -> YZ projection
float2 uv = P.yz;
float4 c = Tex.SampleGrad(TexSampler, uv, dx.yz, dy.yz);
~~~

这里是**教学代码片段**，不包含完整法线基底、随机分布或实际工程资源绑定。

## UE5.4 原型与验证顺序

先做固定 Texture Array + 直接材质混合的 Baseline，确认 GPU Texture Sample 与纹理内存。然后加入地形 RVT，验证近景缓存、法线空间、Page 请求峰值；最后测试远景 SVT 和独立 Wetness Clipmap。

对于 Vertex Shader 读取的高度图，还要考虑明确的驻留保障：并不是一切虚拟纹理采样都自动获得正确的 GPU Feedback。不要在没有核对目标版本材质编译路径前，把所有数据都转换成 VT。

### 什么时候升级架构？

若只存在四种便宜地表材质，直接 Shader 可能更简单；若世界 ID 分布跨大量 Tile，Clipmap 带来内存收益；若近景三层 PBR + Decal 成本很高而页面复用率足够，RVT 更有价值。

下一篇：[地形网格 LOD、CDLOD 与真实几何置换](/post/gdc-terrain-geometry)。

## 来源

- [Wildlands GDC 2017 PPT](https://media.gdcvault.com/gdc2017/Presentations/WERLE_MARTINEZ_GRWterrainTechnologyTools.pdf)
- [三角洲 GDC 2025 PPT](https://media.gdcvault.com/gdc2025/Slides/Jiao_Hang_Delta%2BForce%2BPerformant.pdf)
- [UE5.4 RVT](https://dev.epicgames.com/documentation/en-us/unreal-engine/runtime-virtual-texturing-in-unreal-engine?application_version=5.4)
