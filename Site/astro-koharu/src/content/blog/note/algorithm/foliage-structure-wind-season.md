---
title: "从风动到四季：把植被结构数据变成可复用的材质系统"
link: foliage-structure-wind-season
catalog: true
date: "2026-10-02 13:00:00"
description: "从 Epic Megascans 植被更新出发，拆解风场、主次运动与分层变色，并用交互实验解释结构数据如何驱动一套可扩展的植被材质。"
cover: /img/posts/foliage-structure-wind-season/cover.webp
tags: [Rendering, PBR, GPU, Unreal Engine, Vegetation]
categories:
  - [笔记, 算法]
draft: false
math: true
---

一片草地要显得自然，不能只有“所有顶点一起摆”；一棵秋天的树也不能只有“整张 BaseColor 乘黄色”。它们缺的往往是同一种信息：**这是谁的根部、谁的末端、谁属于同一簇叶片，以及哪些部位应该先发生变化。**

本文的主线是：把植被结构作为独立的数据层，再让风动与颜色共享这层数据。这样，艺术家控制的是植物如何响应环境，而不必为每种外观不断复制模型和材质。

起点是 Epic 的 [Megascans Vegetation: What’s New and What’s Coming Soon](https://www.youtube.com/watch?v=VBcVLzeqYk8)。[官方节目介绍](https://forums.unrealengine.com/t/talks-and-demos-megascans-vegetation-what-s-new-and-what-s-coming-soon/2705282)确认它录制于 Unreal Fest Bali 2025，并展示植被材质与风动更新。需要交代取证范围：本文没有取得这段视频的完整字幕，也不声称逐帧还原演讲；可核验机制来自官方更新说明、作者说明和技术文档。后文的数学模型、RGBA 分配和浏览器演示都是**本文设计的解释性实现，不是 Epic 源码的逆向结果**。

![风场流过草地，绿色叶片逐步转为暖色的植被系统主题插画](/img/posts/foliage-structure-wind-season/cover.webp)

*概念封面：AI 生成插画，不代表引擎截图或算法实测。工程讨论以 UE5.4 的传统 WPO 材质路径为落地语境；新版 Fab 资源的具体编码仍需检查实际资产。*

## 先把几套“风”区分清楚

“Epic 顶点色风动”并不是唯一的一套标准。下面这些名字容易混在一起，但输入数据和适用问题不同。

| 名称 | 已公开的机制 | 本文如何使用 |
| --- | --- | --- |
| SimpleGrassWind | 灰度权重控制基础、无方向风动 | 快速给草和灌木增加运动的基线 |
| Megascans Simplified Wind | 顶点色调整后支持 Primary/Secondary 与随机化 | 学习运动分层与结构数据设计 |
| Megascans Simple Wind | 使用可在 Global Foliage Actor 中调整的噪声模式 | 学习草地阵风的空间组织 |
| Pivot Painter 2.0 | 纹理保存 Pivot、方向和层级等数据 | 用于需要局部旋转与父子关系的复杂枝条 |

[SimpleGrassWind 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-position-offset-material-functions-in-unreal-engine?application_version=5.4)要求输入风强度、速度、灰度权重与 AdditionalWPO，并建议放在 WPO 链末尾。它不规定“R 主干、G 树枝、B 叶片”这样的统一通道协议。

[Megascans 官方更新说明](https://forums.unrealengine.com/t/updates-new-in-megascans/2067776)则确认了两层动画、随机化、噪声风场，以及基于顶点色的枝干分离；它还提供 Health、Color Variation、Growth 和叶片背面调整。这里能确认功能与组织方式，但不能据此写出新版 RGBA 的完整编码表。

这一思路也有更早的工程先例。Tiago Sousa 在 [GPU Gems 3 第 16 章](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis)中把 Crysis 植被动画拆成整体弯曲和叶片细节运动，顶点色同时保存刚度、相位与 AO。它的通道定义属于那套实现，不能直接套到 Megascans。值得继承的是“把结构信息交给 Shader”的方法。

## 交互实验：先看现象，再拆公式

下面是独立的 JavaScript/Canvas 实验，不模拟流体、弹性或 UE 渲染。它以固定种子生成植物，让参数变化具有可比性。上方展示平移的空间噪声，下方展示根部固定的二维草叶；第二页比较同步染色和按叶簇阈值变色。

<iframe src="/img/posts/foliage-structure-wind-season/lab.html" title="植被风场、主次风动与季节阈值交互实验" loading="lazy" sandbox="allow-scripts" style="width:100%;height:850px;border:1px solid #334155;border-radius:16px;background:#0b1420;"></iframe>

[在独立页面打开交互实验](/img/posts/foliage-structure-wind-season/lab.html)，手机上可以获得更大的操作空间。禁用 JavaScript 时，下面的图解、公式和代码仍可独立阅读。

建议按这四步观察：

1. 把阵风权重调为 0，再逐渐增加：从各自摆动变成有空间关联的强弱波带。
2. 关闭 Secondary：草叶只剩大结构摆动；再关闭 Primary，只观察末端细节。
3. 把随机相位调为 0：局部摆动变得整齐，但空间风场仍然让不同位置的植物响应不同。
4. 切到季节页，拖动 Season：同步染色改变所有叶片；分层染色让不同叶簇先后转色，枝干保持原色。

![全局环境和结构数据分别进入风动与外观计算，最终输出 WPO 与材质属性](/img/posts/foliage-structure-wind-season/system.svg)

*原创机制图：共享的是数据语义，风动与外观仍在各自阶段计算，不必把所有功能塞进同一个巨型函数。*

## 风动第一层：风场决定哪里正在起风

如果只计算 `sin(Time)`，整个世界只有一个节拍。即使每株加随机相位，也只是很多独立振子，不能保证一阵风从草地一侧传到另一侧。

一个可控的低成本模型是平移二维噪声：

$$
u=\frac{(x_{xy}-o_{xy})-\hat d\,v\,t}{L},\qquad
A(x,t)=S\left[(1-g)+gN(u)\right]
$$

这里，$x$ 是风场采样位置，$o$ 是固定风场原点；二者用米。$\hat d$ 是世界 XY 平面的单位风向，$v$ 是传播速度，单位米/秒；$t$ 是秒，$L$ 是噪声尺度，单位米。$N$ 的值域为 $[0,1]$，$S$ 是总体强度，$g$ 是阵风权重。

减号的意义可以直接推导：要保持同一噪声特征的 $u$ 不变，位置 $x$ 必须随时间沿 $+\hat d$ 移动，因此图案沿风向传播。$L$ 越大，风带越宽；$v$ 改变传播速度，它与草叶自身的摆动频率是两件事。

这个模型没有求解流体。噪声的平移速度也不等于由真实空气速度推导出的弯曲量；两者作为美术参数分开调节更容易控制。

### 采样坐标要稳定，且要区分尺度

整体运动可以用每株的根部锚点采样风场：同一株获得一致的主要外力。若改成每个顶点都采样高频噪声，枝条会被不同方向的力拉扯，产生橡胶感。大型树冠可以在枝条或簇级采样，不必坚持整棵树一个值。

UE 的实例锚点应来自实际实例变换，例如在顶点阶段把局部原点变换到世界空间。不要直接假定 `ObjectPositionWS` 等于每株植物的根部：包围盒中心与建模 Pivot 本来就是不同概念，还要核查具体实例渲染路径。颜色用到顶点阶段算出的数据时，传统材质路径可通过 VertexInterpolator 或 Customized UVs 传递，并核对目标平台。

用于采样的顶点坐标应排除本次 WPO。否则噪声会随着形变位置变化，改变原先设计的响应。大世界还应让 `x-o` 保持在适当范围；不能把很大的世界坐标先降为 half，再寄希望于减原点恢复精度。若使用世界原点重定位，风场原点也要按同一规则更新。

## 风动第二层：结构决定每个部位如何响应

有了同一个风场，不同植物仍应有不同刚度。本文使用两个运动项：

$$
\Delta p_1=\hat d\,a_1\,w_1^2\,A\left[0.65+0.35\sin(2\pi f_1t+\phi_i)\right]
$$

$$
\Delta p_2=\hat q\,a_2\,w_2\,A\sin(2\pi f_2t+\phi_i+\phi_c),\qquad
\Delta p=\Delta p_1+\Delta p_2
$$

$a_1,a_2$ 是位移幅度，$f_1,f_2$ 是 Hz；$w_1,w_2$ 是结构权重。$\phi_i$ 是实例相位，$\phi_c$ 是叶簇或部件相位，$\hat q$ 是世界空间细节方向。Primary 的系数始终为正，用来表现沿风向偏折叠加摆动；Secondary 是围绕当前结构的双向细节运动。

这些系数是本文的演示选择，不是植物力学常数。浏览器草叶以归一化高度 $h$ 使用 $w_1=h$、$w_2=h^4$，所以底部固定、末端更活跃。真实树木通常需要沿枝条长度烘焙权重，单靠世界高度会把低矮但柔软的侧枝判错。

### 随机化应该对应“一个部件”，而不是“一个顶点”

实例相位负责避免整株复制同步；叶簇相位负责同一株内部的差异。相位种子必须在时间上稳定，并在应该一起运动的部件内部保持一致。

若把每个顶点位置直接 Hash 成相位，同一张叶片会各点乱动。若把当前动画位置作为种子，随机结果还会随运动跳变。更合理的输入是预存的部件种子或稳定的 ID；需要长期可控身份时，也不能把运行时实例序号当成永不改变的资产身份。

### 位移模型的边界：它会拉长植物

上面的加法位移不会保持枝条长度。横向位移增大而高度不变，根部到末端的距离就会增加。这也是浏览器实验有意保留的限制，不能把它描述为保长度弯曲。

可选改进包括限制弯曲幅度、按到根部的距离重新投影，或绕局部 Pivot 旋转。径向重投影保持的是到某个中心的距离，不保证整条曲线的弧长，更不等于枝条链的刚体运动。

[Pivot Painter 2.0](https://dev.epicgames.com/documentation/en-us/unreal-engine/pivot-painter-tool-2.0-in-unreal-engine?application_version=5.4)提供了保存 Pivot、方向和层级的数据路径，适合需要明显局部旋转的资源。但官方也说明其层级计算包含性能近似；不能把它宣传成完整物理树。选择取决于镜头中需要保住的轮廓，而不是“树一定用 Pivot Painter、草一定用顶点色”。

## 数据契约：连续权重和离散 ID 不要混装

下面是**本文建议的自定义布局**。如果直接使用 Megascans 资产，应先读实际材质函数和网格数据，不能按此表重新解释原来的颜色。

| 数据 | 建议语义 | 制作约束 |
| --- | --- | --- |
| Vertex R | Primary 权重 | 根部为 0，按结构连续变化 |
| Vertex G | Secondary 权重 | 固定端为 0，可独立控制叶缘/末端 |
| Vertex B | 部件随机种子 | 同一运动部件的顶点取相同值 |
| Vertex A | LeafMask | 叶片为 1，枝干为 0；边界按需求处理 |
| 实例数据 | 整株随机量或显式状态 | 风相位、颜色、健康等用途分别定义 |
| 可选 UV/纹理 | Pivot、部件 ID、Exposure | 编码与采样设置写进资源规范 |

顶点属性进入光栅阶段后通常会插值。连续权重需要插值；离散分类或 ID 则可能被插值破坏。在一片叶子所有顶点写同一个 B，插值后仍然一致。但若同一个三角形的三角写了不同 ID，中间像素会得到一个并不存在的 ID，`round` 也不能恢复原来的分类。

同样，草叶贴图上的十片叶子若共享一张低模卡片和相同顶点数据，就只能作为一个运动部件。要做逐叶独立运动，需要真实几何分块或另有可寻址的结构数据。逐叶颜色可以使用纹理 Mask，但逐叶几何位移受顶点分辨率限制。

“把 Leaf/Branch/Cluster 都塞进 B”也不是免费压缩。随机种子只需相位差异，精确 ID 则需要稳定解码。必须说明精度、保留值、可编码数量、边界和 LOD 烘焙规则。若项目已经使用 A 保存 AO，就保留它，给 LeafMask 寻找其他来源；不要为了这份示例覆盖已有契约。

## UE Custom 示例：只演示风场与两层偏移

以下可放入传统材质 Custom 节点，输出类型 `CMOT Float3` 并连接 WPO。它是未在 UE 工程实测的说明性代码。浏览器实验使用确定性的 value noise；这里使用可重复采样的风纹理，两者共享组织方式，不逐像素等价。

输入约定：`AnchorWS` 是实例根部，`WindOriginWS` 是固定风场原点，均为厘米；`WindDirXY`、`FlutterDirWS` 由上游提供有效单位方向。`WindTex` 使用 Texture Object，关闭 sRGB、采用 Wrap，其 R 为 $[0,1]$；采样和噪声均在顶点路径。`PrimaryAmpCm`、`SecondaryAmpCm` 为厘米，其余输入按变量名和注释定义。

```hlsl
// TimeSeconds: seconds; PropagationSpeedMps: m/s; WindScaleM: meters
// PrimaryHz / SecondaryHz: cycles per second
// InstanceSeed / PartSeed / PrimaryWeight / SecondaryWeight / Gust: [0,1]
float2 d = WindDirXY;
float2 rootM = (AnchorWS.xy - WindOriginWS.xy) * 0.01;
float2 uv = (rootM - d * PropagationSpeedMps * TimeSeconds)
          / max(WindScaleM, 0.01);
float n = saturate(WindTex.SampleLevel(WindTexSampler, uv, 0).r);
float wind = max(Strength, 0.0) * lerp(1.0, n, saturate(Gust));

float tau = 6.28318530718;
float pi = tau * saturate(InstanceSeed);
float pc = tau * saturate(PartSeed);
float w1 = saturate(PrimaryWeight);
float w2 = saturate(SecondaryWeight);
float primary = PrimaryAmpCm * w1 * w1 * wind
              * (0.65 + 0.35 * sin(tau * PrimaryHz * TimeSeconds + pi));
float secondary = SecondaryAmpCm * w2 * wind
                * sin(tau * SecondaryHz * TimeSeconds + pi + pc);
return float3(d, 0.0) * primary + FlutterDirWS * secondary;
```

`WindTexSampler` 是 UE 根据名为 `WindTex` 的纹理输入生成的采样器名称。不要在像素阶段调用这段代码再指望它驱动顶点，也不要把两个独立振幅重复当成风速使用。若需要倾斜种植，必须定义根部、枝条局部方向如何经过实例旋转转到世界空间；世界 XY 风向与植物自身“向上”是不同的坐标量。

最终最大位移上界可由幅度推得：当权重不超过 1 且方向归一化时，保守值为 `Strength × (abs(PrimaryAmpCm) + abs(SecondaryAmpCm))`。它只是此模型的界，不包括其他叠加 WPO。

## 颜色变化：结构决定先后，LUT 决定颜色

颜色系统可以拆成三个问题：哪里允许变，什么时候变，以及变成什么。

叶片/枝干分离回答第一个问题。第二个问题需要稳定的实例与叶簇差异；第三个问题交给艺术家制作的调色曲线或 LUT。三者分开后，同一种结构数据可以换用不同的秋季、干旱或幻想风格调色板。

Nils Arenz 的 [Megascans Season/Health 作者说明](https://nilsarenz.artstation.com/projects/3dRrXg)将 Health 描述为失去营养后的变化，Season 则具有由外部叶片到内部叶簇的先后关系。这是旧树包的设计说明，不足以证明新版同样使用某张 Exposure 贴图。本文把这种视觉目标转成显式阈值，方便制作和调试。

设 $r_i,r_c$ 为整株与叶簇随机数，$e$ 为暴露程度，值域都是 $[0,1]$：

$$
T=0.15+0.65\left[0.4r_i+0.35r_c+0.25(1-e)\right]
$$

$$
m=\operatorname{smoothstep}(T-0.08,T+0.08,s)
$$

$s$ 是全局 Season，$T$ 是这簇叶片的转色阈值。暴露程度越高，阈值越低，因此更早变色。它不是植物学预测，而是一条美术上可控的次序规则。阈值被限制在 0.15–0.8，配合过渡宽度，让 $s=0$ 时所有叶片为夏季、$s=1$ 时所有叶片完成转色。

交互实验中的 $e$ 根据树冠二维轮廓估计，不能当成真实天空可见度。生产资源可以按美术意图烘焙 Exposure，也可以从局部结构估计；AO 可以辅助，但“AO 高”不必然表示叶片更晚进入秋季。拿不到这个数据时，先去掉暴露项，保留稳定随机阈值即可。

### Health 可以改变状态，不要把它与 Season 混成一个旋钮

一个本文示例是 `age = saturate(Season + HealthLoss * 0.25 * (0.5 + 0.5 * YellowBias))`，其中 `HealthLoss=0` 表示健康，`YellowBias` 是美术控制的局部倾向。再用 `age` 替代上式的 $s$。它会让已经偏黄的部分先进入衰败，但这只是解释性模型，不代表真实营养状态。

实际制作中可以让 Season 指向秋色、Health 指向干枯，两者分别决定目标调色板与状态阈值；不要无条件让所有不健康植物都变成“更秋天”。Growth 也应使用独立的嫩叶 Mask，避免同一片叶子同时被完整套上嫩叶与枯叶效果。

### LUT 与 BaseColor 怎样分工

若只是整体 `BaseColor * Tint`，原有纹理明暗保留得好，但很难把绿色连续变成有层次的黄、红、褐色。可建立二维 LUT：横轴为纹理色调指标，纵轴为状态。这个指标可以是亮度或人工制作的 PhaseMap；不能默认亮度就是叶绿素含量。

本文建议把植物结构决定的 $m$ 作为状态轴，让 LUT 控制最终颜色，再用 LeafMask 与枝干原色混合：

```hlsl
// Conceptual mapping; ColorLUT returns linear-space color.
float2 uv = float2(ToneIndex, State);
// Remap both axes to texel centers for a LUT with dimensions W x H.
uv = (uv * (float2(W, H) - 1.0) + 0.5) / float2(W, H);
float3 leafColor = ColorLUT.Sample(ColorLUTSampler, uv).rgb;
float3 finalColor = lerp(BaseColor, leafColor, saturate(LeafMask));
```

这里的 LUT 返回叶片颜色，直接替换叶片区域的 BaseColor。因此 ToneIndex 或附加细节项必须保住叶脉和纹理层次。若 LUT 返回的是乘色而非最终颜色，则应改为乘色流程；两种约定不能混用。

LUT 应 Clamp、防止跨边界，数据轴不做 sRGB 解码；返回颜色的色彩空间则必须按贴图导入约定统一。连续状态适合过滤，离散预设行要显式选取或在两行之间手动混合。窄 LUT 还需检查压缩串色与 half 坐标精度；小纹理并不自动意味着误差可以忽略。

### 颜色之外还有哪些属性需要一致

叶片正反面、嫩叶与老叶的外观差异还涉及粗糙度和透光。可以用相同状态 Mask 驱动不同属性曲线，但不意味着它们使用相同数值。也不要把“嫩叶更透”直接翻译成提升 Emissive；透射与自发光的行为不同。

季节转色同样不等于落叶。若要冬季裸枝，必须处理叶片几何或贴图集合。作者说明中的冬季外观使用贴图集切换，并指出程序化处理的 overdraw 取舍。本文交互演示只解释变色，不展示落叶，也不证明可无成本转换冬季资源。

## 工程成本：省下的模型变化，可能变成了 Shader 成本

用实例和结构数据生成外观变化，可以减少为相似外观复制资源的需求；但这不保证 GPU 更便宜。共享数据依旧需要解码，噪声依旧要采样，属性依旧要计算。

建议把功能组织为四个边界清楚的材质模块：

| 模块 | 输入与输出 | 调试时先看什么 |
| --- | --- | --- |
| MF_FoliageStructure | 顶点/实例/可选纹理 → 权重、种子、分类 | 单通道可视化与 LOD 一致性 |
| MF_FoliageWindField | 固定锚点、时间、全局参数 → 风量 | 场是否稳定、尺度是否正确 |
| MF_FoliageMotion | 风量、结构、方向 → WPO | 根是否固定、部件是否撕裂 |
| MF_FoliageAppearance | 结构、状态、贴图 → 材质属性 | 枝干是否被染色、叶脉是否丢失 |

这些是本文的模块建议，不是 Epic 的函数名称。统一全局参数可通过项目自己的 Blueprint 与 Material Parameter Collection；它不能自动替代实例状态，也不能假定所有自定义植被都会响应引擎里的 WindDirectionalSource。

### WPO 不会自动解决法线

顶点位置变了，着色法线却可能仍按原来的方向计算。小幅运动不一定显眼，但大幅弯曲时会出现高光方向与轮廓不一致。若按 Pivot 旋转部件，应把相应旋转应用到法线与切线基；若采用连续形变，严格法线变换涉及形变 Jacobian 的逆转置，不能总用一个角度近似。

还要区分几何法线与为植被柔化过的着色法线。用后者作为位移方向是艺术选择，并不等同于真实叶片平面方向。Two Sided 的背面处理也不能代替形变后的法线更新。

### 优化要包括阴影和可见性

[UE5.4 VSM 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine?application_version=5.4)说明 WPO 会影响阴影缓存；过大的 Bounds 也会扩大失效范围。因此检查风动不能只看 Base Pass 的指令数。固定相机、固定灯光，比较静止、Primary、Primary+Secondary 三种配置，同时观察阴影相关 GPU 时间与缓存可视化。

即使 Shader 用距离把振幅乘成 0，也不能仅凭这个表达式证明已经停止 WPO 求值或阴影失效。需要检查目标版本的距离禁用属性、材质变体和实际渲染结果。把活动植被强行当作 Rigid 缓存可能得到滞后的阴影，必须明确接受画面代价。

[UE5.4 Nanite 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.4)也要求关注 WPO 位移范围。给出合理的 Max World Position Offset Displacement 与 Bounds，既要防止运动后的叶片被裁掉，也不能无限放大。Nanite 的几何细节选择不会自动替你减少噪声层数、颜色功能或次级运动。

LOD 时先保留成片传播的低频风场，再逐步去掉局部细节，是本文的可试验策略。远景也要避免转色阈值、种子与叶片分类突然改变；否则几何 LOD 平滑了，整棵树仍会突然换色。移动端与桌面端应分别编译并测量，不沿用未经测量的“此方案更便宜”判断。

## 把这套思路落进资产流程

第一次接入时，先选一株结构清晰的草和一棵枝叶分离的测试树，完成以下顺序：

1. 写出数据契约，逐通道显示权重、种子和 LeafMask。检查导入、压缩、LOD 与实例旋转后是否仍正确。
2. 风场先输出灰度，确认坐标、方向和传播速度；再接 Primary，最后添加 Secondary。
3. 固定时间检查根部与部件边界，逐步提高振幅，记录开始拉伸或法线失配的位置。
4. 颜色先只显示阈值 Mask，再接 LUT，最后连粗糙度和透光；单独测试 Season 两端、Health 与 Growth 的组合。
5. 固定镜头做成本对照，同时检查阴影与剔除；据此决定远景关闭哪些功能。

最有价值的产物不只是一次更自然的摆动，而是一份可以在 DCC、导入流程、Shader 和 LOD 之间流通的结构约定。它让“哪里动、哪里先黄、哪里是枝干”各有明确输入，也让资源出现问题时可以分层定位。

顶点色能承担其中一部分，但复杂 Pivot、精确 ID 和多套 Mask 可能需要额外 UV 或纹理。数据越多并不必然越好；应先决定镜头要表现的结构，再选择足以表达它的最小数据集。

## 来源与复现范围

核验日期：2026-10-02。本文核对了以下公开资料；没有取得新版 Megascans 完整材质源码，也没有在 UE 工程中编译和测量上述 HLSL。交互页面是本文原创的算法示意，不作为引擎性能或物理真实性证据。

- [原视频](https://www.youtube.com/watch?v=VBcVLzeqYk8)与[官方节目说明](https://forums.unrealengine.com/t/talks-and-demos-megascans-vegetation-what-s-new-and-what-s-coming-soon/2705282)：演讲语境与展示范围。
- [Updates: New in Megascans](https://forums.unrealengine.com/t/updates-new-in-megascans/2067776)：风动、随机化与材质功能的官方说明。该帖子发表于 2024 年，不能当成 2025 演讲的完整逐字稿。
- [GPU Gems 3 第 16 章，Tiago Sousa](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis)：主次运动与结构数据的历史工程先例。原文 Figure 16-2 可查看顶点色分工，Figure 16-4 可查看弯曲效果。
- [Nils Arenz：Vegetation Season / Health](https://nilsarenz.artstation.com/projects/3dRrXg)：旧 Megascans 树包作者的外观系统说明。
- [SimpleGrassWind](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-position-offset-material-functions-in-unreal-engine?application_version=5.4)、[Pivot Painter 2.0](https://dev.epicgames.com/documentation/en-us/unreal-engine/pivot-painter-tool-2.0-in-unreal-engine?application_version=5.4)：UE 工具定义与限制。
- [UE5.4 VSM](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine?application_version=5.4)、[UE5.4 Nanite](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.4)：阴影缓存与位移范围的工程约束。

官方帖子和 GPU Gems 都有值得查看的原图；本文未确认可用于本站再发布的图像授权，因此保留原文图号与入口，机制图与交互实验自行绘制。
