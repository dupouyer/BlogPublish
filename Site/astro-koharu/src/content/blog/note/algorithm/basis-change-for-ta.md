---
title: "基变换：向量没有转，只是换了一组刻度"
link: basis-change-for-ta
cover: /img/posts/basis-change-for-ta/cover.svg
catalog: true
math: true
date: "2026-11-19 23:27:25"
description: "用固定向量、两组坐标轴和可检查的重建，理解基变换；再把 CameraVectorWS 转到以修改后像素法线为 Z 轴的着色坐标系。"
tags: [数学, Shader, 图形学]
categories: [[笔记, 算法]]
draft: false
series:
  id: linear-algebra-for-ta
  order: 2
  stage: coordinates
collection: [normal-mapping]
prerequisites: [dot-cross-linear-algebra]
interactive: true
difficulty: 入门
learningOutcome: "区分向量与坐标读数，用正交单位基测量和重建，并解释为什么一根法线不能唯一确定切线坐标系。"
---

`CameraVectorWS` 已经能从世界空间转到切线空间。那把材质法线改斜以后，怎样得到它在“新法线空间”里的方向？

**不需要透视投影矩阵。需要先确定三根新坐标轴，再沿它们读取同一根向量的分量。** 但一根法线只能确定 Z 轴，不能决定 X/Y 朝哪里。本文先把这两件事看清，再落到 UE 材质。只讨论正交单位基；不把着色法线的改变当作几何表面的变形。

## 同一根箭头，为什么能有两组数字？

固定世界空间向量 $V=(0,0,1)$。第一组坐标轴就是世界 X/Y/Z，它读作 $(0,0,1)$。把尺子换成下列三根轴，箭头仍然不动：

$$
T'=(0.8,0,-0.6),\quad B'=(0,1,0),\quad N'=(0.6,0,0.8).
$$

这三根轴长度都是 1，彼此垂直。新读数是

$$
c=(V\cdot T',V\cdot B',V\cdot N')=(-0.6,0,0.8).
$$

负的 X 不是箭头翻转了，而是箭头沿新 X 轴的反向分量为 0.6。下面先固定箭头，只改变坐标轴；同时看世界箭头、新读数和重建结果，不要只盯着数字。

![金色向量在两组基底中指向同一世界方向；紫色分量首尾相接，重建原向量。](/img/posts/basis-change-for-ta/same-vector-two-frames.svg?v=20261119-size)

[交互：换一组尺子，方向不变](/labs/basis-change)

*本文原创教学模型。默认例子的世界箭头始终为 $(0,0,1)$；改变基轴时，坐标读数改变，按当前基重建后仍应回到同一箭头。演示不代表 UE 运行测试。*

## Dot 负责测量，加权相加负责重建

[上一篇 Dot / Cross](/post/dot-cross-linear-algebra) 把 Dot 看成沿一根单位轴的有符号读数。基变换只是一次使用三把尺子：

$$
c_x=V\cdot T,\quad c_y=V\cdot B,\quad c_z=V\cdot N.
$$

反过来，沿三根轴分别走这些距离，再相加：

$$
V=c_xT+c_yB+c_zN.
$$

默认例子的重建可以直接检查：

$$
-0.6(0.8,0,-0.6)+0.8(0.6,0,0.8)=(0,0,1).
$$

为什么 Dot 能拿到系数？把重建式两边与 $T$ 点乘：$T\cdot T=1$，另外两项因垂直而归零，剩下的就是 $c_x$。这也是[正交单位基坐标定理](https://www.math.uwaterloo.ca/~jmckinno/Math225/Week5/Lecture2b.pdf)的内容。

若把三根轴作为列组成 $Q=[T\ B\ N]$，上面两步就是 $c=Q^TV$、$V=Qc$。**只有正交单位基才能用转置代替逆矩阵。** 一般基需要 $Q^{-1}V$；轴有缩放或不垂直时，三个原始 Dot 不再直接是坐标。

## 转箭头与换刻度，不是一回事

- **主动旋转**：坐标轴不动，把箭头从 $V$ 转成 $RV$。
- **被动换基**：世界箭头不动，把描述它的数字改成 $Q^{-1}V$。

同一张旋转矩阵可能参与两种计算，区别是“谁在动”和乘法方向，不是公式里有没有矩阵。

这里每个 Dot 都可解释为轴向投影，但三项一起保留了完整向量，没有把三维点压成屏幕坐标，也没有齐次除法。透视投影解决成像；本篇解决同一方向如何换一种描述。处理位置而非方向时，还要先减去新坐标系的原点。

## 只有 N，为什么还差一个选择？

把上例的 $N'$ 固定，让 X/Y 围绕它转 90°：

$$
T''=B',\quad B''=-T',\quad N''=N'.
$$

同一 $V$ 的读数变为 $(0,0.6,0.8)$。X/Y 改了，Z 没改，两次重建都得到 $(0,0,1)$。

这说明“新法线空间”不是唯一答案。还必须规定绕 N 的朝向：例如尽量沿网格切线，或者沿某个固定世界方向。回到[交互实验](/labs/basis-change)，保留倾角和方位，单独拖动「绕法线旋转」。这相当于从 N 的正方向看向原点，只转动用于测量的两把平面尺子。

## 在 UE 中：先补齐基，再读取 CameraVectorWS

Epic 将 [CameraVectorWS 定义为像素指向相机的方向，PixelNormalWS 定义为当前像素法线的世界方向](https://dev.epicgames.com/documentation/en-us/unreal-engine/vector-material-expressions-in-unreal-engine)。[UE 5.4 的 Transform](https://dev.epicgames.com/documentation/en-us/unreal-engine/vector-operation-material-expressions-in-unreal-engine?application_version=5.4)在已知空间间转换，并处理镜像 UV；它没有让你输入任意新 N 的接口。改变 Normal 输入，不等于把网格切线基的三根轴一起重新定义。

一种明确的约定是：让新 T 尽量沿网格切线。将参考切线 $T_0$ 在 N 方向的分量减掉，再归一化，最后补出 B。以下是 UE Custom 节点的说明性 HLSL，输出新基下的方向，未做 UE 编译与平台测试。

输入全部为世界空间：`VWS` 接 CameraVectorWS；`NWS` 为非零的新着色法线；`T0WS/B0WS/N0WS` 分别由 `(1,0,0)/(0,1,0)/(0,0,1)` 经过 Tangent→World 的 Transform 得到。

```hlsl
float3 N = normalize(NWS);
float3 T = T0WS - N * dot(T0WS, N);

// 参考切线接近 N 时，投影方向失效，换备用轴。
if (dot(T, T) < 1e-6)
{
    float3 A = abs(N.z) < 0.999
        ? float3(0, 0, 1) : float3(0, 1, 0);
    T = A - N * dot(A, N);
}
T = normalize(T);

// 保留网格基的手性，而不是假定所有 UV 岛都相同。
float h = dot(cross(N0WS, T0WS), B0WS) < 0 ? -1.0 : 1.0;
float3 B = h * cross(N, T);
return float3(dot(VWS, T), dot(VWS, B), dot(VWS, N));
```

节点图对应 `Dot → Multiply → Subtract → Normalize` 得到 T，`Cross` 得到 B，再用三个 `Dot` 和 `AppendVector` 输出坐标。备用轴和手性分支不能在简化节点图时悄悄省掉。

还有三个边界：

- 若计算结果要参与生成 Normal，不能再读由它决定的 PixelNormalWS，否则形成依赖循环；应传入该阶段已经独立算出的 NWS。
- 备用轴能避免零向量归一化，但切换处可能不连续；需要连续纹理方向时，应设计连续的参考场，而非把这段兜底当成无缝方案。
- 验证时检查轴长、两两 Dot 和重建误差；还需在实际网格上检查镜像 UV、双面材质与非均匀缩放。不要把坐标读数直接接回 Normal，误当作新的法线。

## 本篇到哪里为止？

基变换不是“把方向扭过去”，而是**确定三根尺子、沿轴测量、按轴重建**。在 UE 中最容易漏掉的不是矩阵写法，而是新法线之外的参考朝向与手性。

非均匀缩放后，法线为什么需要逆转置，是另一个问题：它要维持法线与变形后表面的垂直关系。不与本篇的坐标读数混为一谈。如果你更想先看真实材质案例，可以接着读[法线贴图遇到负缩放](/post/normal-map-mirror-symmetry)，看基底手性如何影响同一张法线贴图的读法。
