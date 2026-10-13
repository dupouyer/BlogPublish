---
title: "法线贴图遇到负缩放：为什么球形正常，浮雕却变了？"
link: normal-map-mirror-symmetry
catalog: true
date: "2026-10-13 17:30:00"
description: "从 ScaleX=-1 的球形与浮雕对照出发，推导 UV、切线基底和光照的镜像关系，给出 UE 材质补偿、世界投射与可下载的对称测试贴图。"
cover: /img/posts/normal-map-mirror-symmetry/cover.webp
tags: [Rendering, Unreal Engine, Shader, 线性代数]
categories:
  - [笔记, 算法]
draft: false
math: true
---

把两个 Quad 并排放置，一个 `ScaleX=+1`，另一个 `ScaleX=-1`，给它们使用同一张切线空间法线贴图。居中的球形凸起看起来一样，方向测试图和卷草浮雕却变了。这个现象很容易让人怀疑：负缩放是否破坏了法线？是否必须把材质切到世界空间？

**法线贴图可以用于镜像模型。关键在于：镜像后的浮雕是否满足你要比较的对称条件，以及采样坐标与法线基底是否对应。** 对严格左右对称的高度场，正确镜像后的世界法线可以在同一归一化位置保持一致；普通花纹没有这个保证。若需求是只镜像模型、保持材质朝向，则要同时处理采样位置和法线方向。

本文以 UE5.3/5.4 的材质工作流为应用语境，先推导正交平面的最小模型，再讨论自定义投射。下文交互与 Python 检查验证的是数学模型；HLSL 是接入示例，未在 UE 工程、Nanite、ISM 或移动渲染路径中运行。官方在线文档可能跳转到较新版本，因此不据此承诺所有版本和渲染路径的负缩放行为一致。

## 先约定：比较的是哪两个位置

两个平面分别居中，把平移差去掉以后，取相同的横向归一化位置 $x\in[0,1]$。原平面的该位置采样 $u=x$；模型水平镜像后，该位置对应原模型另一侧，采样 $u'=1-x$。

这句话描述的是**世界位置到模型 UV 的对应关系**。模型上的顶点 UV 属性并没有被引擎统一改写成 `1-UV.x`。如果追踪同一个模型顶点，它仍携带原来的 UV，只是移动到了另一侧。

![同一归一化位置在原 Quad 上采样 U=x，在负缩放 Quad 上采样 U=1-x；切线 T 同时反向](/img/posts/normal-map-mirror-symmetry/basis.svg)

图 1：镜像同时改变“这里取哪一个像素”和“像素里的方向怎样转到世界”。本文原创示意；假设模型 X 与 UV 的 U 方向对齐，镜像轴通过平面中心。

后面的 $T$、$B$、$N$ 分别是原平面的单位切线、副切线和几何法线。在这个特定平面上，镜像轴沿 $T$，法线垂直于镜像轴，所以：

$$
T'=-T,\qquad B'=B,\qquad N'=N.
$$

**模型 X 轴不必等于 UV 的 U 轴。** UV 旋转、斜切、不同面朝向或另一根镜像轴都会改变这组关系。不能把本文的 `NormalTS.x *= -1` 无条件套到任意模型。

## 一个像素存的是相对于基底的方向

切线空间法线 $n=(n_x,n_y,n_z)$ 的三个分量对应 $T,B,N$。在正交单位基底下，世界空间着色法线为：

$$
N_w(u,v)=\operatorname{normalize}\big(n_x(u,v)T+n_y(u,v)B+n_z(u,v)N\big).
$$

这里要分清三个对象：

| 对象 | 用途 | 是否随贴图变化 |
| --- | --- | --- |
| 几何法线 $N$ | 定义表面朝向及基底 | 最小平面模型中不变 |
| 切线法线 $n$ | 贴图在自己的坐标系中表达的方向 | 随采样位置变化 |
| 世界着色法线 $N_w$ | 最终参与光照的方向 | 由采样与基底共同决定 |

用普通 RGB 保存标准法线时，示意编码是 $C=0.5n+0.5$；解码是 $n=2C-1$。但 UE 的 Normal 类型采样已经处理了法线解码，不能再对它无条件执行一次 `*2-1`。GPU 上的压缩格式也可能只保存 XY，再重建 Z，因此文件里的蓝通道不一定是运行时参与计算的那份数据。

[MikkTSpace 的接口说明](https://github.com/mmikk/MikkTSpace/blob/master/mikktspace.h)给出了切线与手性符号的组合关系：

```hlsl
B = Handedness * cross(N, T);
```

`Handedness` 是相应基底的 ±1 符号。网格切线数据中的手性与物体变换造成的朝向变化，需要由实际渲染管线一致处理。只写 `B=cross(N,T)`，相当于固定选择一种手性；当本例的 $T$ 反向时，就会把本应保持的 $B$ 也翻掉。镜像 UV 与负物体缩放是不同操作，不能混用它们的标志。

Epic 的 [Transform 材质表达式文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/vector-operation-material-expressions-in-unreal-engine#transform)明确说明它考虑镜像 UV。但这不等于一条涵盖所有负缩放、实例化和自定义基底的验证结论。具体项目仍要检查最终世界法线。

## 球形凸起为什么能抵消两次变化

在本文的平面条件下，镜像平面最终得到：

$$
N'_w(x,v)=\operatorname{normalize}\big(-n_x(1-x,v)T+n_y(1-x,v)B+n_z(1-x,v)N\big).
$$

要在同一位置满足 $N'_w(x,v)=N_w(x,v)$，对于单位法线场就需要：

$$
\begin{aligned}
n_x(1-u,v)&=-n_x(u,v),\\
n_y(1-u,v)&=n_y(u,v),\\
n_z(1-u,v)&=n_z(u,v).
\end{aligned}
$$

居中的标准球形凸起满足这组关系：左侧与右侧的横向斜率大小相等、方向相反，另两个分量相同。镜像后的采样先取得另一侧的 $n_x$，切线 $T$ 再反向，最终方向抵消。

例如原位置的法线是 $(0.6,0.2,\sqrt{0.6})$，镜像位置恰好是 $(-0.6,0.2,\sqrt{0.6})$；后者乘上 $(-T,B,N)$，就得到相同世界法线。这里的 Z 约为 0.775，两者都是单位向量。

这是一种特殊的对称性。**球形测试成功，只说明该样例的变化能够抵消；不能单独证明非对称贴图、另一套 UV 或自定义基底也正确。** 绿色通道被错误翻转时，球形的明暗和凸凹判断同样可能改变，不能因为轮廓仍然圆就说 Green 约定无关。

## 浮雕要对称，导数也必须对称

对平面上的单值高度场，采用等尺度参数，并把 $n_y$ 定义为沿 V 增长方向的分量：

$$
n(u,v)=\operatorname{normalize}\left(-\frac{\partial H}{\partial u},-\frac{\partial H}{\partial v},1\right).
$$

若高度场满足严格左右对称：

$$
H(1-u,v)=H(u,v),
$$

对两边求导，链式法则给出：

$$
H_u(1-u,v)=-H_u(u,v),\qquad H_v(1-u,v)=H_v(u,v).
$$

两个位置的坡度长度相同，所以归一化以后仍然满足前面的法线对称条件。图案整体均衡、轮廓近似对称、叶片数量相同，都不能替代这个导数条件：细小的沟槽、方向性细节和不同旋向的卷曲，都可能改变局部坡度。

还有一个容易漏掉的条件：**对称轴必须与正在执行的镜像映射一致。** 一个重复铺排的纹样可能围绕某个单元中心对称，却不围绕整张贴图的 `u=0.5` 对称。UV 平移、平铺倍率或裁剪窗口会改变对应关系；此时需要检查实际映射 $u\mapsto c-u$，而不是仅比较原图的左右边。

下面对照使用原创高度场。第一行严格对称；第二行加入方向性细节。右列同时补偿 UV 与 Normal X，展示“让材质保持原方向”的另一种目标。

![严格对称高度场在负缩放后保持相同光照；非对称高度场发生变化；UV 与 Normal X 同时补偿恢复原法线场](/img/posts/normal-map-mirror-symmetry/comparison.png)

图 2：相同方向光下的简化漫反射对照。本文 Python 生成；不包含 UE 压缩、阴影、AO 或高光。

### 亲手改变对称条件

先保持圆顶默认设置，观察世界法线平均角差；再切到复杂浮雕，把不对称强度从 0 向上调。随后分别试“只补偿 UV”“只补偿 Normal X”“两者同时补偿”。最后故意翻转 B，圆顶也会暴露基底错误。

<section class="article-lab" aria-label="法线镜像交互实验">
<iframe class="article-lab-frame" src="/img/posts/normal-map-mirror-symmetry/lab.html" title="法线镜像：采样、基底、材质补偿与灯光交互" loading="lazy" style="width:100%;height:1100px;border:1px solid #64748b;border-radius:16px;"></iframe>
</section>

静态说明：严格对称高度场的 Nx 左右反号，Ny/Nz 左右相同，正确基底可以抵消镜像；非对称场默认不能抵消。[独立打开交互实验](/img/posts/normal-map-mirror-symmetry/lab.html)。界面可查看采样坐标、切线法线、世界法线、平均角差及亮度差；手机上图像和控件纵向排列。

### 四象限图测的是方向，不能要求它镜像后相同

一种方向测试图的布局是：

| | 左侧 | 右侧 |
| --- | --- | --- |
| 上半部 | $+U$ 倾斜 | $-U$ 倾斜 |
| 下半部 | $+V$ 倾斜 | $-V$ 倾斜 |

上半部可能抵消 X 镜像；下半部的 Ny 左右反号，明确违反 $n_y(1-u)=n_y(u)$，因此世界法线应当改变。它是一张方向诊断图，未必能积分成连续的真实高度场。不能只凭“不一样”就判定手性错误；应把各象限预测的世界方向与实际 GBuffer 比较。

## 镜像几何并不意味着明暗图也镜像

这是从“法线正确”走到“光照正确”时最关键的边界。令 $R=\operatorname{diag}(-1,1,1)$，在 T/B/N 对齐的坐标中，镜像后的法线场为 $R\,N_w(1-x,v)$。

简化 Lambert 光照是：

$$
I(x,v)=\max\big(0,N_w(x,v)\cdot L\big).
$$

固定世界光源时，镜像版本得到：

$$
I'(x,v)=\max\big(0,N_w(1-x,v)\cdot R L\big).
$$

这通常不等于 $I(1-x,v)$。同一片斜坡从朝向左灯变成背向左灯，几何做了镜像，亮度却不能直接拿原图左右翻转得到。若光源也变成 $L'=RL$，这个简化模型中的亮度才会与原图构成镜像。

反过来，两个不同的法线也可能具有相同的 `dot(N,L)`。例如只有 X 分量反号、而 $L_x=0$ 时，漫反射亮度可以相同。黑区的 `max(0,·)` 截断还会掩盖更多差异。**单个光源的颜色截图不足以证明法线场一致；世界法线视图更直接。**

即使两块平面的世界法线相同，真实场景中的点光源方向、视线、高光、阴影、AO、反射和曝光差异仍可能让颜色不同。交互故意同时给出“法线角差”和“亮度差”，避免把两个量混成一个结论。

## UE 中只镜像几何、保留材质朝向

如果目标就是让模型和浮雕一起镜像，应先使用正确的网格切线与导入设置，按镜像后的方向检查法线。不要为了让两边颜色相同而额外翻通道。

若目标是几何镜像，但花纹在两个平面的相同归一化位置仍朝相同方向，则在本文对齐条件下需要两步：把 UV 镜回来，再把采样法线的 X 分量反向，抵消负缩放后的 T。

下面是 UE5.3/5.4 Custom 节点的接入示例。材质保持 **Tangent Space Normal 开启**；`MirrorX` 是明确传入的 0/1 参数，不由代码推测。可由两份材质实例或已有实例参数提供；普通 Actor 参数设置与 ISM 的 PerInstanceCustomData 路径应分别接入。

第一个 Custom 节点：`UV` 为 float2，`MirrorX` 为 float，输出 float2。

```hlsl
float m = step(0.5, MirrorX);
return float2(lerp(UV.x, 1.0 - UV.x, m), UV.y);
```

用其输出采样贴图。BaseColor、Roughness 等需要保持朝向的纹理，应使用相同坐标策略。法线 Texture Sample 使用 Normal 类型，输出接第二个 Custom：`NormalTS` 为已经解码的 float3，`MirrorX` 为 float，输出 float3，连接材质 Normal。

```hlsl
float m = step(0.5, MirrorX);
return float3(NormalTS.x * (1.0 - 2.0 * m), NormalTS.yz);
```

| 处理方式 | 采样位置 | 切线方向解释 | 非对称花纹能否恢复原世界法线 |
| --- | --- | --- | --- |
| 默认镜像 | 另一侧 | 随模型镜像 | 通常不能，符合整体镜像目标 |
| 只翻 UV | 恢复原位置 | X 仍朝反方向 | 通常不能 |
| 只翻 Normal X | 仍取另一侧 | X 方向被补偿 | 通常不能 |
| 两者同时翻 | 恢复原位置 | X 方向被补偿 | 本文对齐平面条件下可以 |

这里 `1-u` 是围绕 `u=0.5` 的补偿；一般形式是 `2*PivotU-u`。对周期贴图，偏移、平铺和旋转的运算顺序必须一起定义。不能随意在任意位置插入 `1-u`，然后假定采样的是同一个纹样。

负缩放的变换行列式只告诉你整体朝向是否反转，不能辨认到底哪根轴为负；两根轴为负时行列式还能恢复为正。模型若不满足 X/U 对齐，需根据完整基底关系转换法线，而不是只传一个“镜像标志”翻 R。

## 自定义世界投射：采样基底必须与重建基底一致

普通 Mesh UV 的切线空间由网格提供。若改用世界位置或自定义 Local Surface Mapping 生成 UV，新坐标的 U/V 轴可能已经与网格切线不同。

例如固定世界投射：

$$
u=\operatorname{dot}(P-O,U_{ws})\,Density_U+Offset_U,\qquad
v=\operatorname{dot}(P-O,V_{ws})\,Density_V+Offset_V.
$$

这里 $P$、$O$ 为同一世界坐标空间中的位置，$U_{ws},V_{ws}$ 为单位投射轴，Density 的单位是“每世界长度的纹理重复次数”。若 Density 为负，UV 增长方向也会反转；下面例子假设密度为正，并且三个轴构成与贴图约定一致的正交单位基底。

新 UV 中采到的法线应按**新投射基底**重建：

$$
N_{ws}=\operatorname{normalize}(n_xU_{ws}+n_yV_{ws}+n_zN_{ws,base}).
$$

把它仍按镜像后的网格 TangentWS 解释，就会出现“贴图位置看起来对，世界法线方向却错了”。这是基底不匹配。关闭 Tangent Space Normal 只是让输入改为世界空间语义，不会把原始切线法线自动转换成正确世界方向。

以下 Custom 输出 float3。输入 `NormalMapTS` 是 Normal 采样结果；`UAxisWS`、`VAxisWS`、`BaseNormalWS` 是与投射 UV 对应的正交单位世界轴。**关闭材质 Tangent Space Normal** 后，把输出直接接 Normal。

```hlsl
return normalize(
    NormalMapTS.x * UAxisWS +
    NormalMapTS.y * VAxisWS +
    NormalMapTS.z * BaseNormalWS
);
```

也可以保持 Tangent Space Normal 开启，把上述世界法线经引擎 Transform 节点转换为 Tangent 后再接 Normal。两种方式表达同一个方向，选择取决于材质现有结构；没有必要仅因负缩放就把普通 UV 材质全部迁到世界空间。[Epic 的无切线空间 bump 示例](https://dev.epicgames.com/documentation/en-us/unreal-engine/bump-mapping-w/o-tangent-space?application_version=4.27)说明了世界法线输出与该开关的关系，本文只引用输入空间约定。

若投射坐标本来就固定在世界中，它可能已经没有随几何镜像，这时再统一补偿 `UV.x=1-UV.x` 会重复处理。Local Mapping 若去掉了缩放符号，重建轴也必须按相同目标组织。Triplanar、曲面或倾斜投射则需要各投射面、权重、方向约定及相应基底，不能直接当作本文的一张正交平面。

非均匀缩放还涉及法线的逆转置变换，与这个 ±1 反射例子是另一个问题。不要把 `normalize` 当成可以修复错误变换矩阵的步骤。

## 用可预测的输入定位错误

先锁定一个普通正交 Quad，排除双面法线翻转、WPO 和额外法线混合。确认贴图按 Normalmap 导入、sRGB 关闭、采样器类型为 Normal；绿色通道约定按实际来源确认。翻 G 应用于修正约定，不是用于反复试到某个灯光“看起来一样”。

然后同时比较：同一归一化位置的世界法线、对应纹样位置的镜像方向。对本文平面，默认镜像应满足 $N'_w(x,v)=R N_w(1-x,v)$；只有贴图严格满足对称条件时，才能进一步要求 $N'_w(x,v)=N_w(x,v)$。

| 对照 | 观察重点 | 能支持的判断 |
| --- | --- | --- |
| 普通 UV＋方向测试图 | 各象限是否符合预测世界方向 | 网格 UV 与切线链路的方向是否一致 |
| 普通 UV＋严格对称高度法线 | 同位置法线应接近一致 | 该样例的镜像抵消是否成立 |
| 普通 UV＋目标花纹 | 与理论镜像场比较，不只比较颜色 | 区分非对称内容与方向错误 |
| 自定义 UV＋相同方向图 | 新 U/V 是否对应法线重建轴 | 优先排查投射基底不匹配 |

一个球形样例通过，不能“100% 确认整个 UE/TBN 没问题”；上述对照通过，也只覆盖对应网格、材质和渲染路径。ISM、Nanite、双面、移动端等路径需要在项目目标条件下补测。

### 检查源贴图时保留编码假设

对标准线性 RGB 法线，可先计算 $n=2C-1$，检查长度、XY 的单位圆约束，再比较：

$$
E(u,v)=\angle\left(n(u,v),\,R\,n(1-u,v)\right).
$$

统计时要说明解码方法、是否重新归一化、Z 是否由 XY 重建、镜像轴及采样范围。RGB 长度偏离 1 可能来自量化或过滤；XY 明显超出单位圆需要检查源图或其编码约定。**这些检查与“是否镜像对称”是两个独立问题。** 一张非对称法线可以完全合法，一张对称贴图也可能有错误的编码。

不能仅凭一张截图宣布“这张法线有大量非法 RG”，也不能把未经定义的平均误差写成已验证数据。即使重新生成或归一化了法线，它也不会自动变成左右对称场。XY 裁回单位圆只能避免某些数值错误，无法恢复丢失的浮雕细节或原本不存在的对称关系。

### 下载一个非球形、严格对称的测试样例

本文从原创复杂高度函数生成测试图，法线由浮点高度函数的中心差分产生。在 512×512 像素中心上，Python 检查了单位长度、X 镜像对称、非对称反例和双重补偿。浮点对称场的最大分量差为 0，单位长度误差小于 $10^{-12}$；这不代表 PNG 导入和 GPU 压缩后仍然精确无误差。

- [对称法线 PNG，512×512](/img/posts/normal-map-mirror-symmetry/symmetric-normal.png)
- [对称高度 PNG，16 位](/img/posts/normal-map-mirror-symmetry/symmetric-height-16.png)
- [生成与数学检查脚本](/img/posts/normal-map-mirror-symmetry/generate_test.py)

脚本定义 U 向图片右侧、V 向图片下侧，法线分量沿各自参数增长方向表达；接入 UE 时，应结合网格 B 与采样约定确认 Green 方向。高度存储区间为 `[-0.25,0.55]`，按固定仿射映射编码。PNG 法线为 8 位，保存后存在量化误差；UE 法线压缩与 Mip 过滤还会增加误差。应比较容差内的方向，而不是要求所有通道逐字节相同。

负缩放的诊断因此可以收敛到一个明确问题：**当前像素采到了哪个法线，它又是按哪套轴解释的？** 两者一致时，非对称浮雕变化是整体镜像的自然结果；需要保持材质朝向时，再根据明确的艺术目标补偿采样和基底。

## 参考与延伸

- [MikkTSpace 原始接口与算法实现](https://github.com/mmikk/MikkTSpace)：切线、手性符号及烘焙/渲染基底一致性的要求。
- [Epic：Vector Operation Material Expressions](https://dev.epicgames.com/documentation/en-us/unreal-engine/vector-operation-material-expressions-in-unreal-engine)：Transform 与 DeriveNormalZ 的语义。
- [Epic：Material Properties](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-material-properties)：Tangent Space Normal 等材质设置。
- [Epic：Bump Mapping Without Tangent Space](https://dev.epicgames.com/documentation/en-us/unreal-engine/bump-mapping-w/o-tangent-space?application_version=4.27)：世界法线输出的材质输入约定。
- [本站：从 dot 到 cross 的可视化线性代数](/post/dot-cross-linear-algebra)：投影、叉积与基底关系的交互解释。
