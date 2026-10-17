---
title: "风格化边缘光：近处留笔触，远处退到亚像素"
link: stylized-rimlight-depth-width
date: "2026-10-17 20:10:00"
description: "用方向性深度偏移构造 RimLight，再以透视投影、近处上限和亚像素淡出控制宽度。附真实 3D 模型实验与 UE5 Custom 节点示例。"
cover: /img/posts/stylized-rimlight-depth-width/cover.webp
tags: [Rendering, Unreal Engine, Shader, GPU]
categories: [[笔记, 算法]]
catalog: true
draft: false
math: true
interactive: true
difficulty: 进阶
prerequisites: [dot-cross-linear-algebra]
learningOutcome: "区分轮廓检测与亮度调制，能推导边缘光的视距宽度，并识别亚像素与场景纹理采样的边界。"
---

建筑离镜头很远时，一条始终占据数个像素的边缘光，会逐渐吃掉建筑本身。靠近镜头后，如果完全按照世界宽度投影，亮边又可能宽得像一片额外的受光面。风格化渲染需要在这两个尺度之间做选择：**近处限制屏幕占比，保留克制的笔触；远处按透视缩小，允许低于一个像素并淡出。**

本文讨论一种方向性的后处理边缘光：沿主光在屏幕上的方向偏移，比较前后深度，找出轮廓内侧的一条带状区域，再决定它有多亮。主公式只有一条：

$$
u(Z)=\min\left(\frac{w}{2Z\tan(\theta_y/2)},\ u_{\max}\right)
$$

$u$ 是以视口高度归一化的偏移，$w$ 是视平面上的世界尺度宽度，$Z$ 是正的线性视深度，$\theta_y$ 是垂直 FOV。近处由 $u_{\max}$ 封顶；远处由 $1/Z$ 自然收细。不再加“至少一像素”的下限。亚像素阶段再显式压低亮度，避免离散深度采样偶尔跳出一整像素的亮点。

落地语境为 UE5.4 桌面延迟后处理。公式是透视几何推导；下方 Three.js 实验是独立的解释性实现；文中 Custom 节点代码是对应实现示例，尚未在 UE 工程内编译验证。它不逐行复刻某个项目材质，也不把浏览器结果当成引擎实测。

## 先用 3D 模型看三个尺度

先点击“远景”，在“固定像素”和“混合”之间切换。固定模式仍向外寻找 4 像素远的深度，混合模式的偏移与亮度一起降低。再点击“近景”，比较“固定世界宽度”和“混合”：后者在近处封顶。

<section class="article-lab" aria-label="风格化边缘光 3D 实验">
<iframe class="article-lab-frame" src="/labs/rimlight" title="RimLight：真实 3D 深度偏移与视距宽度对比" loading="lazy" style="width:100%;height:1240px;border:1px solid #64748b;border-radius:16px;"></iframe>
</section>

[独立打开 3D 实验](/labs/rimlight)

实验可调整视距、垂直 FOV、世界宽度、近处上限、灯光与观察角度；“线性深度”“边缘光 Mask”“偏移像素宽度”对应算法中间结果。关闭亚像素淡出，可检查“偏移已经很小，但仍偶尔采到背景”的情况。无 WebGL 时自动使用 Canvas 2D 软件光栅化：同一组三角形、透视深度缓冲与偏移规则，简化漫反射着色，宽度最多 480 渲染像素。两条路径都无法启动时，仍保留静态图和可计算数值。

这里使用程序化塔楼、圆柱和多面体，实际生成颜色、深度与法线信息，再执行全屏处理；没有用模型描边或 Fresnel 假装深度效果。WebGL 路径的法线需要额外 Pass，软件路径在三角形光栅化时保存法线权重，而 UE 延迟路径可以读取已有 GBuffer，因此不能直接类比成本。软件与 GPU 的着色和分辨率不同；数值栏始终显示当前路径的实际渲染高度。

## 亮边为什么出现在轮廓内侧

设当前像素为 $p$，向灯光的屏幕方向移动一小步 $\Delta p$。当前点在塔楼表面时深度较近；偏移点跨到天空或远处建筑时，深度明显增加。

$$
\Delta Z=\max\bigl(Z(p+\Delta p)-Z(p),0\bigr),\qquad
M_{edge}=\operatorname{smoothstep}(a,b,\Delta Z)
$$

如果两个点仍落在同一块接近平坦的表面上，深度差较小；如果偏移跨过可见边界，深度差增大。只保留正差，意味着把光画在较近表面的内侧。交换差值顺序，会改变被选中的一侧。

![当前点在前景，沿屏幕光方向偏移后落到更远背景，正深度差选中轮廓内侧](/img/posts/stylized-rimlight-depth-width/depth.svg)

*深度偏移示意，本文绘制。橙色点属于前景，青色点属于背景；比较的是两个采样位置的线性视深度。图为二维剖面，不表示真实光线传播。*

偏移只负责“向哪里找边界”，阈值 $a,b$ 负责“多大的深度差才算边界”。它们与 $Z$ 使用同一单位，UE 常用厘米；不能把原始硬件深度的差，直接当作厘米差。

这与常见的 $\bigl(1-N\cdot V\bigr)^n$ Fresnel Rim 不同。后者可以在平滑曲面的掠射区域发亮，即使旁边没有深度断层；这里必须先检测到指定方向上的可见深度变化。法线调制在后面控制方向和强弱，不能替代边界检测。

方向性深度差也不等于准确的几何轮廓：斜面本身的深度坡度、同一模型的前后部件、两个相接物体，都可能产生响应。提高阈值能压低误检，也可能漏掉真正的小深度差边界。为集中观察建筑，实验额外乘以 `1 - smoothstep(0.65, 0.95, abs(NormalWS.y))`，过滤近水平表面，避免大地面坡度产生整条亮带。演示以世界 Y 为上轴；UE 通常以 Z 为上轴，迁移该遮罩时应使用 `NormalWS.z`。这是演示的作用范围遮罩，不属于前面的宽度公式，也不是普适的误检修复；生产项目可按美术目标用材质或 Stencil 定义范围。

## 从世界宽度推到 UV，名字里的 Pixels 不能代替单位

透视相机前方深度为 $Z$ 的截面，高度为：

$$
h_{view}=2Z\tan(\theta_y/2)
$$

截面上的宽度 $w$ 占画面高度的比例就是 $w/h_{view}$。乘上当前渲染视口的像素高度 $H$，得到偏移像素数：

$$
u_{world}=\frac{w}{h_{view}},\qquad
r_{px}=H\,u_{world}
$$

因此，当某段代码写成 `rimWidthPixels / viewHeight`，而 `viewHeight` 的单位来自 `SceneDepth`，分子的实际语义应是与深度一致的世界长度，或者是已缩放到该语义的艺术参数。它并不会因为变量名里有 Pixels，就自动成为固定像素宽度。固定 $k$ 像素的偏移应写成 $k/H$。

这里的 $w$ 也不是沿弯曲物体表面测量的恒定厚度。它是视平面尺度的近似；轮廓曲率、采样方向与边缘法向之间的夹角，都会改变最终亮带宽度。若边缘的屏幕单位法向为 $n_e$，局部直线边界上的有效厚度约为 $|\Delta p\cdot n_e|$，而非总偏移长度。

| 量 | 语义 / 单位 | 使用条件 |
| --- | --- | --- |
| $Z$ | 线性视深度，cm 或 m | 相机前向深度，不是离相机的欧氏距离 |
| $w$ | 视平面世界宽度，与 $Z$ 同单位 | 为艺术控制建立稳定的尺度参考 |
| $\theta_y$ | 垂直 FOV，弧度 | 不直接代入相机水平 FOV |
| $u_{\max}$ | 占视口高度的比例，无量纲 | 例如 0.012 为画面高度的 1.2% |
| $W,H$ | 当前 Pass 的视口像素尺寸 | 不默认等于显示器尺寸或底层纹理尺寸 |

若已知水平 FOV，正方形像素下应转换为 $\tan(\theta_y/2)=\tan(\theta_x/2)\,H/W$。动态分辨率、宽高比变化后，重新检查这里的尺寸是否与深度缓冲对应。

## 近处封顶，远处缩小：两段规则在哪里切换

将世界尺度投影与上限取最小值：

$$
u=\min(u_{world},u_{\max}),\qquad
Z_{switch}=\frac{w}{2u_{\max}\tan(\theta_y/2)}
$$

当 $Z<Z_{switch}$，世界投影很大，由屏幕占比上限接管；当 $Z>Z_{switch}$，世界投影更小，宽度按 $1/Z$ 减少。这就是自适应逻辑，不需要先根据距离写一条额外的近远 Lerp。

![固定像素保持水平，世界宽度随深度下降，混合宽度在近处封顶后与世界投影曲线重合](/img/posts/stylized-rimlight-depth-width/width.svg)

*宽度函数，本文按公式绘制。水平轴为线性视深度，采用对数刻度；垂直轴为像素偏移。虚线标出 1 px，它是观察参考，不是下限。*

以 $H=540$、垂直 FOV 为 $50°$、$w=6$ cm、$u_{\max}=0.012$ 为例，切换发生在约 5.36 m：

| 线性视深度 | 固定世界宽度投影 | 混合偏移 | 混合模式的亚像素淡出权重 |
| --- | --- | --- | --- |
| 1 m | 34.74 px | 6.48 px | 1.000 |
| 5 m | 6.95 px | 6.48 px | 1.000 |
| 10 m | 3.47 px | 3.47 px | 1.000 |
| 50 m | 0.695 px | 0.695 px | 0.777 |
| 100 m | 0.347 px | 0.347 px | 0.278 |

这些是公式计算值，不是 UE 截图测量。实验中的每个像素使用自己的深度，控件下面只显示模型中心参考值。

这里限制的是**画面高度占比**。在 540 高下是 6.48 px，在 1080 高下是 12.96 px；同一画面占比保持不变。若项目真正要求所有分辨率都最多 6 px，应改用 `MaxPixels / H` 作为上限。两种艺术目标都能成立，但不能用一个参数名字混在一起。

## 原来的增宽补偿，不是“一像素保底”

一种已有的偏移补偿形式是逐分量计算：

```hlsl
RimUVOffset = baseRimUVOffset + min(baseRimUVOffset, InvViewSize);
```

只看非负的一个分量，设基础偏移为 $x$，一个纹素的跨度为 $i$：当 $x<i$ 时，结果是 $2x$；当 $x\ge i$ 时，结果是 $x+i$。因此它的意义是“小偏移翻倍，大偏移最多再加一纹素”，不是 `max(x,i)`。

当 $x\to0$，结果仍趋向零。它没有强制保留一像素，不过会把远处达到亚像素的距离推远。若希望宽度严格对应前面的投影模型，可以先去掉补偿作为基准；确实需要增宽时，再把补偿做成可控的艺术选项，并用补偿后的最终偏移计算淡出。若补偿发生在限幅之后，实际偏移还可能略超出原上限，需要重新检查。

这条分量补偿应作用于非负宽度，随后再乘方向。直接对带符号的偏移向量做同样的 `min`，负分量会得到不同语义。`InvViewSize` 还必须与当前使用的坐标域一致，不能把底层场景纹理的一个 texel，当作视口的一个 pixel。

## 亚像素宽度为什么不保证自动平滑消失

公式可以连续缩小，深度缓冲却是离散的。使用 Point 采样时，一次很小的偏移可能还读到原来的深度，下一次相机轻微移动又跨入背景纹素。只要深度差足够大，阈值仍可能输出接近 1 的 Mask。TAA 有时会缓和它，也可能留下抖动、拖影或被历史抹掉。

本文用一个简单的显式淡出策略：

$$
F_{sub}=\operatorname{smoothstep}(0,1,r_{px}),\qquad
M=M_{edge}\,F_{normal}\,F_{sub}
$$

大于等于 1 px 时不衰减；低于 1 px 后逐渐减弱；趋近零时亮度也趋近零。这没有扩大偏移，也没有把采样半径强行钉在一像素。它只是艺术上压低残留亮点的权重，**不是精确的像素覆盖积分，也不能保证所有时间闪烁消失**。

不要为了得到“平滑”而随意双线性插值原始非线性深度：跨物体边界混出的值不代表真实表面。更精细的覆盖估计、多次采样和时间处理可以另做设计；当前方案优先保持单方向偏移与清楚的宽度语义。

## UE Custom 节点：宽度、采样、亮度分开检查

下面将宽度计算独立出来，避免把内部场景纹理接口硬塞进同一个大 Custom。这样先用节点确认 UV 与深度，再接亮度调制。示例针对透视视口、正方形像素，输入都是材质图已经准备好的值。

### 节点 A：输出有方向的 ViewportUV 偏移

Custom 主输出设为 `Float2`，额外输出为 `OffsetPixels`、`SubpixelFade`（均为 Float1）。输入如下：

| 输入 | 含义 |
| --- | --- |
| `LinearDepth` | 当前像素正线性视深度，cm |
| `RimWidthCm` | 视平面宽度，cm |
| `TanHalfFovY` | $\tan(\theta_y/2)$，由实际投影准备 |
| `MaxRimUVOffset` | 占视口高度的上限，非负 |
| `ViewSize` | 当前 Pass 视口的 $(W,H)$ |
| `LightDirectionVS` | 已归一化、从表面指向灯光的 View Space 方向 |

```hlsl
// Main output: float2, in ViewportUV units (UE screen Y points down).
// Additional outputs: OffsetPixels (float1), SubpixelFade (float1).
float Z = max(LinearDepth, 0.01);
float H = max(ViewSize.y, 1.0);
float W = max(ViewSize.x, 1.0);
float U = min(
    max(RimWidthCm, 0.0) / (2.0 * Z * max(TanHalfFovY, 0.0001)),
    max(MaxRimUVOffset, 0.0));

float2 D = LightDirectionVS.xy * float2(1.0, -1.0);
float D2 = dot(D, D);
float ValidDirection = D2 > 1e-8 ? 1.0 : 0.0;
D *= rsqrt(max(D2, 1e-8));

OffsetPixels = U * H * ValidDirection;
SubpixelFade = smoothstep(0.0, 1.0, OffsetPixels);
return D * U * float2(H / W, 1.0) * ValidDirection;
```

横向的 `H / W` 让水平与垂直偏移拥有相同的像素尺度；如果直接把同一个 $u$ 赋给 x、y，在宽屏中水平跨度会更大。这里先在屏幕像素方向上归一化，再转换到 UV。

`float2(1,-1)` 的前提是输入视空间 x 向右、y 向上，而 UE ViewportUV y 向下。若上游已经完成翻转，不要重复处理。灯光方向若定义成光传播方向，也需要先取反。最简单的校验是把灯移到画面右侧，确认采样点向右偏移。

当灯光几乎朝向视线，xy 投影接近零，二维方向本来就不明确；这里关闭该方向性效果，避免 `normalize(0)`。实际项目可按方向长度加入柔和过渡，但不能凭空选一个方向。

### 材质图：使用一致的 UV 域采样两个深度

1. 从 `ScreenPosition` 的 `ViewportUV` 得到当前 $p$，在同一域内相加，得到 $q=p+\Delta UV$。
2. 分别采样当前与偏移位置的 SceneDepth，确认得到相同单位的线性深度，再传给节点 B。
3. 检查 $q$ 是否落在当前有效视口内，越界时令 `ValidMask=0`；可以把读地址夹到安全边界，但不能让夹边结果继续被当作真实轮廓。
4. 通过当前像素的 GBuffer 世界法线和世界光方向计算法线权重；仅作用于当前像素，不用背景法线混合它。
5. 用 `PostProcessInput0` 作为该位置的输入颜色，并把结果接回后处理输出。

[Epic 的后处理材质文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/post-process-materials?application_version=4.27)明确区分 ViewportUV 与 SceneTextureUV：编辑器共享的底层纹理可能大于当前视口。因此，材质节点的坐标约定与手写 `SceneTextureLookup` 内部接口不能混用。文档入口展示的是长期存在的坐标问题；UE5.4 自定义引擎里的内部函数签名与纹理 ID 仍应查看本机生成 HLSL，不能照抄其他版本。

这里使用材质节点负责纹理读取。若迁到全 Custom 路径，必须把 ViewportUV 正确转换到对应场景纹理域，并同步转换边界；`clamp(UV,0,1)` 本身不足以描述底层纹理里一个偏移的子视口。

### 节点 B：深度断层、法线权重和亚像素权重

Custom 输出设 `Float1`。以下输入均为标量，`BaseDepth`、`OffsetDepth`、`EdgeMin`、`EdgeMax` 使用厘米；`NormalWeight`、`SubpixelFade`、`ValidMask` 是 $[0,1]$ 权重。

```hlsl
float DeltaZ = max(OffsetDepth - BaseDepth, 0.0);
float A = max(EdgeMin, 0.0);
float B = max(EdgeMax, A + 0.001);
float Edge = smoothstep(A, B, DeltaZ);
return Edge * saturate(NormalWeight)
            * saturate(SubpixelFade)
            * saturate(ValidMask);
```

法线权重可先使用 `smoothstep(-0.15, 0.45, dot(NormalWS, LightDirectionWS))`。演示采用这一可调制方向的简化规则；它选择哪些朝向更亮，不负责判断阴影遮挡。接入项目现有的材质类型、距离或艺术遮罩时，把它们明确乘入相应阶段；没有源代码与输入约定，不把这些附加项解释成已知的物理规律。

调试时可暂时把 `NormalWeight` 设为 1、单独观察 `Edge`；确认深度边界后再恢复方向调制。最终示意合成是 `PostProcessInput0 + RimColor * RimIntensity * Mask`。其亮度受放置阶段、曝光与色调映射影响，需要回到实际后处理链路验证。

## 哪些情况要回到引擎里验收

浏览器可以检验“公式与可见行为是否一致”，无法代替 UE 的材质编译与时间稳定性测试。落地时优先检查下面这些会改变结论的条件：

- **分辨率与后处理阶段**：在固定构图下更改 Screen Percentage，检查 $H$ 是否对应本 Pass；显示像素与渲染像素不要混算。对比 TAA 开关、相机缓慢平移与远处细建筑。
- **斜面与遮挡交界**：大斜墙可能因深度坡度误亮；两个物体之间可能产生内部轮廓。按需要增加 Primitive / Stencil 限制，或采用深度感知判据，而不是只无限提高阈值。
- **法线与透明物体**：法线贴图细节可能把边缘切碎；透明材质是否写入所用深度、法线从哪里来，要检查实际渲染路径。不能默认透明玻璃拥有不透明 GBuffer 的全部信息。
- **画面边界与背向灯光**：越界采样应失效；光方向投影退化应关闭或过渡。方向性 Rim 不读取灯光的真实阴影可见性，不能称为物理逆光。
- **平台范围**：先保留原项目移动端与主机的旁路条件，再分别核验其纹理能力与成本；桌面演示不构成平台兼容证据。

就单方向核心而言，需要当前/偏移深度、当前法线与输入颜色；多方向、多层阈值会增加读取和组合工作。实际开销还受分辨率、缓存、Pass 调度与平台影响，不能仅凭几行 ALU 推断毫秒收益。实验只在参数或尺寸改变时重绘，并在卸载时释放渲染目标与材质，避免阅读文章时持续运行一个无变化的 3D 循环。

这套设计保留了明确的艺术取舍：近处用上限控制笔触，远处让世界尺度投影决定收细速度；亚像素淡出负责压低离散采样的残留，而深度阈值与法线权重分别决定边界和明暗。每项控制只解决自己的问题，才容易知道“太宽”“太亮”或“闪烁”应该改哪里。

## 资料与实现入口

- [Epic：Post Process Materials](https://dev.epicgames.com/documentation/en-us/unreal-engine/post-process-materials?application_version=4.27)：输入颜色、场景纹理与 UV 域约定；页面为 UE4.27 文档，不作为 UE5.4 内部接口签名依据。
- [Three.js：DepthTexture](https://threejs.org/docs/pages/DepthTexture.html) 与 [RenderTarget](https://threejs.org/docs/pages/RenderTarget.html)：浏览器演示的离屏颜色、深度与资源释放机制；仓库使用 Three.js 0.182.0。
- [本文 3D 实验](/labs/rimlight)：模型、参数、Mask 与深度通道；公式、曲线和 Custom 均为本文解释性实现。

*封面为 AI 生成的风格化场景概念插画，不是实验截图。正文示意图按本文公式绘制。*
