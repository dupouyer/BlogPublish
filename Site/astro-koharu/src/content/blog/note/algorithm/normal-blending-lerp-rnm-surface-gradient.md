---
title: "法线混合：从 Lerp、RNM 到 Surface Gradient"
link: normal-blending-lerp-rnm-surface-gradient
date: "2026-10-26 18:40:00"
description: "从平坦法线反例出发，推导 RNM 与共同切线基下的 Surface Gradient，交互比较 2/4 层、顺序依赖与强度，并给出 UE5 Custom Node 接入边界。"
cover: /img/posts/normal-blending-lerp-rnm-surface-gradient/cover.svg
tags: [Rendering, Unreal Engine, Shader, 线性代数]
categories: [[笔记, 算法]]
catalog: true
draft: false
math: true
collection: [normal-mapping]
prerequisites: [normal-map-mirror-symmetry]
interactive: true
difficulty: 进阶
learningOutcome: "按叠加语义选择 Lerp、RNM 或 SG，并核对强度、共同基底与镜像手性。"
---

墙面的大块起伏已经烘焙到 Base Normal，再加一道细裂纹，为什么大形体反而变平？当裂纹、风化和颗粒增加到四层，为什么交换两个节点的位置，高光也会改变？问题往往在于：我们把“方向插值”“细节重定向”和“坡度相加”当成了同一件事。

**先决定层与层的关系，再选算法。** 材质状态之间的过渡可以使用法线插值；细节要随 Base 倾斜，可使用 RNM；各层在共同参考表面上贡献坡度，可使用 Surface Gradient（SG）。层数并不是决定质量的标准，RNM 不一定优于 SG，SG 也不因为有四层就自动更正确。

本文面向 UE5 实时渲染技术美术。浏览器实验和数学例子已按同一模型实现；HLSL 是面向 UE5 常规 Surface 材质的说明性代码，**未在 UE 编辑器及目标 GPU 中编译、截图或计时验证**。它们不修改网格几何法线或轮廓，只生成用于光照的着色法线。

## 先看三种规则，再动参数

![三种规则：Lerp 逐层平均、RNM 逐层重定向、SG 在共同基底累加坡度后恢复法线](/img/posts/normal-blending-lerp-rnm-surface-gradient/comparison.svg)

实验不是三张预制图片：滑块会重新计算每个像素的输入法线和混合结果。先将 Detail 强度调到 0，观察平坦细节是否改变 Base；再切到 4 层并反转顺序，观察下方探针的角差。最后打开 RGB，排除光照对方向差异的掩盖。

[交互：法线混合实验](/labs/normal-blend)

三栏输入完全一致：A 是低频大形体，B/C/D 是不同方向的高频图案；所有法线都由同一平面的程序化高度导数生成，使用同一正交切线基。Base/Detail 强度乘在坡度上，频率改变纹理密度而保持坡度振幅；若把真实高度场的频率提高而高度振幅不变，坡度通常也会随之提高，这里特意将二者解耦。

实验采用简化 Lambert 漫反射，不包含粗糙度、高光、阴影、视差或几何位移。探针固定在参数域 (0.7, 0.4)，数值仅表示该点，不是整张图的误差统计。某一点角差接近零，也不能据此证明两种运算普遍相同。

## 输入约定：先把坐标说清楚

设参考表面的正交单位基为 $T,B,N$，切线空间中 $N=(0,0,1)$。每层输入 $n_i$ 已解码、归一化，且 $n_{iz}>0$。本文 SG 实验只讨论这个共同基底下的局部坡度叠加，是完整 Surface Gradient 框架的特例，也对应常见的 Partial Derivative（PD）相加。

| 量 | 含义 | 本文约定 |
| --- | --- | --- |
| $n_i$ | 单层切线空间着色法线 | 已解码到 [-1,1]，单位长度 |
| $p_i=n_{i,xy}/n_{iz}$ | 法线表示的二维坡度参数 | 等于高度梯度的负值 |
| $g_i=\nabla_S h_i$ | 参考表面的三维表面梯度 | 沿切平面，无 $N$ 分量 |
| $s_i$ | 单层强度 | 乘坡度，不乘完整单位法线 |
| $w_i$ | 层权重或 Mask | 固定共同参考下的标量 |

烘焙法线必须使用与资产匹配的切线空间；不是所有任意 RGB 图都代表可积的高度场。演示约束了正 z 与有限坡度，并没有验证背向法线、陡到掠射的贴图或不同 UV 的转换。

## Naive sequential lerp：平均并不等于叠加

这里比较的方法严格定义为：从第一层开始，每次与新层等权插值并归一化。

$$
\begin{aligned}
r_1&=n_1,\quad t=0.5,\\
r_k&=\operatorname{normalize}\bigl((1-t)r_{k-1}+t n_k\bigr).
\end{aligned}
$$

两层时它就是 normalize(A+B)，可以交换 A/B。但把平坦法线 $e_z$ 当“没有细节”送入，结果却会朝 $e_z$ 偏移。以 $A=(0.6,0,0.8)$ 为例：

| 操作 | 结果（约值） |
| --- | --- |
| Lerp(A, flat, 0.5) 后归一化 | (0.316, 0, 0.949) |
| RNM(A, flat) | (0.600, 0, 0.800) |
| SG(A, flat) | (0.600, 0, 0.800) |

这个反例说明 Lerp 会稀释叠加语义中的 Base；但在两个材质状态之间做过渡时，方向平均本身可能正是目标。不要把“叠加失败”写成“Lerp 永远错误”。相反方向的输入可能让插值向量为零，归一化无定义；本实验的输入域避开了这种情况。

四层串接时，每一步都重新归一化，不能把它简单解释成四层各占 25%。即使忽略归一化，反复 t=0.5 也会使 A/B/C/D 的系数变成 1/8、1/8、1/4、1/2。实际单位向量串接的系数还受中间长度影响。因此实验的全序反转角差在两层 Lerp 中为零，四层通常不为零。

## RNM：把细节的“上方”转向 Base

Reoriented Normal Mapping（RNM）把 Detail 的参考方向 $e_z$ 重定向到 Base：$R_b e_z=b$，输出 $R_b d$。这里使用不额外绕 Base 扭转的最短弧旋转；Base 恰好等于 $-e_z$ 时最短旋转轴不唯一，应排除或另行约定。

对单位向量 $b,d$，Self Shadow 给出的高效形式可写为：

$$
\begin{aligned}
t&=b+(0,0,1),\\
u&=(-d_x,-d_y,d_z),\\
r&=\frac{t\,(t\cdot u)}{t_z}-u.
\end{aligned}
$$

有效域内旋转保持长度；示例仍在末尾 normalize，以吸收数值误差。不要把网上面向 [0,1] 纹理采样的预处理常量，与这里已解码的输入混用。

```hlsl
// 两个输入均为已解码的单位切线空间法线。
// UE5 Custom Node: BaseTS/DetailTS 为 float3，Output Type 为 Float3。
float3 t = BaseTS + float3(0, 0, 1);
float3 u = DetailTS * float3(-1, -1, 1);
return normalize(t * (dot(t, u) / t.z) - u);
```

RNM 的两个恒等关系很实用：RNM(Base, flat)=Base，RNM(flat, Detail)=Detail。它适合表达“Base 上附着 Detail”，但这个目标与高度导数相加不同。

四层可以写作 RNM(RNM(RNM(A,B),C),D)。这会依次改变下一层的参考朝向；一般不满足交换律或结合律，换层顺序、换括号都可能影响结果。不能把 RNM 的任意串接解释成若干独立高度层之和。两层 RNM 也可能对交换输入敏感，实验反转时包括 Base，所以它同时改变了主从关系。

## Surface Gradient：在同一参考表面上相加

### 从高度场推到法线

先看局部平面 $P(u,v)=(u,v,h(u,v))$：

$$
\begin{aligned}
P_u&=(1,0,h_u),\\
P_v&=(0,1,h_v),\\
P_u\times P_v&=(-h_u,-h_v,1).
\end{aligned}
$$

因此 $n=\operatorname{normalize}(-h_u,-h_v,1)$，反解得到：

$$
p=\frac{n_{xy}}{n_z}=(-h_u,-h_v).
$$

多个高度以固定权重相加时，导数也相加。于是可以先累加 $p$，再恢复一次法线：

$$
\begin{aligned}
p_{sum}&=\sum_i w_i s_i\frac{n_{i,xy}}{n_{iz}},\\
n_{out}&=\operatorname{normalize}(p_{sum,x},p_{sum,y},1).
\end{aligned}
$$

### 对应完整 SG 框架的哪一部分

在参考表面上，$\nabla_S h$ 是与法线垂直的表面梯度。正交 $T,B$ 下：

$$
\begin{aligned}
g&=\nabla_S h=h_uT+h_vB\\
 &=-p_xT-p_yB,\\
N'&=\operatorname{normalize}\left(N-\sum_i w_i s_i g_i\right).
\end{aligned}
$$

同一基底下这与上面的 slope sum 完全一致。它不是把世界法线的 x/y 随手相加；完整框架还负责将不同参数化、体积噪声与投影的扰动统一为共同参考表面的梯度。曲面上的常规 bump 模型会忽略高度乘法线变化等曲率项，不能声称它等于任意大位移曲面的精确法线。

若已有单位世界空间扰动法线 $m$，参考法线为单位 $N$，且 $m\cdot N>0$，可恢复对应切向梯度：

$$
g=N-\frac{m}{m\cdot N}.
$$

这里 $m$ 必须已通过它自己的正确基底变到世界空间，而且所有层使用相同参考 $N$。每层用不同的“已扰动法线”作参考再转换，会破坏并列相加的语义。

SG 的顺序无关来自共同向量空间中的固定加法；浮点求和仍可能有末位差异。两层一样可以使用 SG，四层一样可以有意使用 RNM。方法之间的视觉差别来自不同模型，不能当成误差排行榜。

### Mask 不等于高度合成的完整导数

若定义实际高度 $H=\sum_i w_i(u,v)h_i(u,v)$，乘积法则要求：

$$
\nabla_S H=\sum_i\left(w_i\nabla_S h_i+h_i\nabla_S w_i\right).
$$

通常的法线层 Mask 只实现第一项。这是扰动贡献的艺术加权，不一定是带边缘高度变化的精确高度合成。Normal Map 也无法提供丢失的绝对高度值，不能仅由 slope 反推出第二项。

## 强度：统一修改坡度，再进行比较

直接 normalize(s*n) 不会改变非零 n 的方向。本文统一采用：

$$
\begin{aligned}
n_s&=\operatorname{normalize}(s n_x,s n_y,n_z)\\
&=\operatorname{normalize}(s p_x,s p_y,1),\\
&\qquad n_z>0.
\end{aligned}
$$

s=0 恢复平坦，s=1 保留原法线。RNM、Lerp、SG 都先收到这个处理后的输入；这样变化来自混合规则，而不是某一栏偷偷放大细节。强度在线性坡度域调整，不表示倾角或最终光照线性变化。s 为负可翻转凹凸坡度，但本文控件只提供非负值。

```hlsl
// UE5 Custom Node: NormalTS(float3), Strength(float)，输出 Float3。
// 只接受已经解码、z>0 的合法法线；强度不改变 UV 平铺。
return normalize(float3(NormalTS.xy * Strength, NormalTS.z));
```

输入 nz 接近零时，坡度会趋于无穷。下例 max(nz, epsilon) 是数值截断策略，会改变极陡输入的结果，不是数学上的无损修正，也不支持 z<=0 的法线。

## UE5 Custom Node：四层共同基底 SG

以下示例针对 UE5 常规 Surface 材质、Tangent Space Normal 开启的路径。A/B/C/D 为四个已解码的 float3 切线法线，Strength 为 float4 坡度强度，Weight 为 float4 非负贡献权重；全部输入共用一个正交切线基。输出 Float3，接材质 Normal。两层模式将 Weight.zw 设为 0。

```hlsl
// 本实验域 nz>0。epsilon 仅防止接近水平时除零。
float epsilon = 1e-4;
float4 k = Strength * Weight;
float2 p = A.xy / max(A.z, epsilon) * k.x
         + B.xy / max(B.z, epsilon) * k.y
         + C.xy / max(C.z, epsilon) * k.z
         + D.xy / max(D.z, epsilon) * k.w;
return normalize(float3(p, 1));
```

这里权重不要求和为 1，因为目标是相加。如果目标是材质过渡，应明确使用归一化权重或 lerp(pA,pB,t)，而不是把过渡和叠加共用一套未说明的强度。

接入时检查这些事实：

1. 纹理设置使用 Normal 压缩和 Normal 采样语义，核对 sRGB、绿色通道约定及导入设置。UE 常规 Normal Texture Sample 输出已经解码，**不要再统一乘 2 减 1**；特殊自定义采样路径需要自己明确编码方式。
2. 在混合前处理强度，RNM 串接时每一节点使用上节公式。四层 SG 的 Strength 已在坡度域应用，不要再额外重复强化输入。
3. Tangent Space Normal 关闭时，Normal 输入需要世界空间输出。应通过匹配的基底变换，不能把本例切线结果直接连接过去。
4. 不默认 `BlendAngleCorrectedNormals` 就是本文 RNM。材质函数资产、平台与引擎版本需要单独核对：打开函数图，检查输入约定及生成 HLSL，再用平坦输入、斜坡和随机向量与参考式比较。本文未审计某一 UE5 小版本的该函数。

Custom Node 的采样、导数、精度和优化受编译路径影响。浏览器中的 JavaScript 双精度正确不等于移动 GPU half 精度正确；请在目标平台检查极陡输入、法线压缩、Mip 过滤和高频闪烁。不提供未测量的性能倍数。

## TBN、UV 镜像与 Height 的边界

**同一 UV 坐标不自动保证同一法线基底。** 旋转或镜像 Detail UV 后，它的切线方向也需要相应旋转或反射。不同 UV 通道、世界投影和三平面各有自己的参数化，不能直接把对应贴图的 xy/z 当作同一个二维坐标中的坡度相加。

对镜像 UV，常见基底重建形式为 $B=\sigma(N\times T)$，$\sigma$ 包含切线手性；具体叉乘顺序与符号必须与项目约定一致。负缩放还会影响变换的手性和绕序。遗漏符号可能让凸起变凹或高光反向，任何混合算法都不能修复这种输入错误。排查方法见[法线贴图遇到负缩放](/post/normal-map-mirror-symmetry)。

Height Gradient 的优势是保留了高度标量及其导数关系。真实纹理高度的导数需要考虑 UV 到表面的 Jacobian、纹理平铺和世界尺度；纹理里的“0.1 高度”没有天然的厘米单位。屏幕 ddx/ddy 也不是可直接相加的世界坡度，必须结合表面位置导数转换，并避开导数退化或不连续处。体积函数可投影梯度：$\nabla_S h=\nabla h-N(N\cdot\nabla h)$。

Normal Map 则只保存方向，可能来自艺术编辑或高模烘焙；一般不能恢复全局一致的高度，更不能恢复遮挡和轮廓。用 n.xy/n.z 得到局部坡度表示，不等于证明整张图可积。多 UV、曲面和三平面应参考完整 SG 框架进行转换，而不是把本文共同基底的 Custom Node 直接推广过去。

## 如何判断实现是否符合目标

| 检查 | 预期 | 能排查的问题 |
| --- | --- | --- |
| 全部输入 flat | 三种方法都为 flat | 编码或归一化错误 |
| Base + flat Detail | RNM、SG 保留 Base；Lerp 变平 | 是否误把插值当叠加 |
| 2 层等权 Lerp 交换 | 方向相同 | 演示或权重不一致 |
| 4 层固定共同基 SG 反转 | 仅浮点舍入差 | 是否混入了逐层参考变换 |
| RNM(flat, Detail) | Detail | RNM 解码和符号错误 |
| 镜像 UV 与非均匀缩放 | 基底与资产一致 | TBN 手性、UV 导数与变换失配 |

本文自动数值检查覆盖恒等关系、坡度相加和顺序反例；交互用于检查同一输入在三种规则下的变化。UE 内还需拿平面、斜坡、曲面和镜像网格，对照资产烘焙基底检查；几何、材质和采样设置要固定后再比较。性能必须单独通过目标平台的实际 Shader 与 GPU 测量。

回到最初的墙面：如果裂纹应顺着砖块 Base 的朝向附着，RNM 表达清楚；如果风化、颗粒和高度噪声都相对同一参考表面贡献坡度，SG 的统一累加更直接。先确认这个建模关系，再谈层数、节点数量和视觉取舍。

## 参考资料

- Morten S. Mikkelsen，[Surface Gradient–Based Bump Mapping Framework](https://jcgt.org/published/0009/03/04/)，JCGT 9(3), 60–90, 2020。本文共同基底 slope sum 只是该框架的局部特例；多 UV、体积扰动与参数化转换请阅读原文。
- Colin Barré-Brisebois、Stephen Hill，[Blending in Detail](https://blog.selfshadow.com/publications/blending-in-detail/)，2012。包含 PD、Whiteout、RNM 的推导、实现和对比；本文 RNM 实现按已解码输入书写。
- Epic Games，[Custom Material Expressions](https://dev.epicgames.com/documentation/en-us/unreal-engine/custom-material-expressions-in-unreal-engine) 与 [UMaterial API](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/UMaterial)（包括 bTangentSpaceNormal）。接入实际项目时按目标 UE5 版本核对采样与 Custom Node 设置。
