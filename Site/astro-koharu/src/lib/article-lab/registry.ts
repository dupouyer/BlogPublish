export const labs = {
  'dot-projection': {
    title: 'Dot Projection · 有符号进度',
    family: 'dot',
    note: '默认 V=(2,1,0)、N=(1,0,0)：dot=2。把 V 拖到 N 背面，进度变负。只有单位 N 时 dot 才是长度分量。',
  },
  'unit-cos': {
    title: '单位向量与 cos',
    family: 'dot',
    note: '改变向量长度，夹角不变但 dot 会变。只有两者都归一化时 dot=cosθ；零向量没有夹角。',
  },
  'dot-linearity': {
    title: '标量搬入搬出 dot',
    family: 'linearity',
    note: '默认 t=2：t·dot(V,N)、dot(tV,N)、dot(V,tN) 都等于 4；dot(V,N)=dot(N,V)。负 t 会反向。',
  },
  'multiply-divide': {
    title: '乘投影与除投影',
    family: 'ray',
    note: '已知完整参数 t：depth=t·dot(dir,N)。已知 depth：t=depth/dot(dir,N)。拖动 dir 比较两个方向的计算。',
  },
  'ray-depth': {
    title: 'Ray–Plane Intersection',
    family: 'ray',
    note: '原点 O=(0,0,0)，平面 x=2，单位 N=(1,0,0)。t=2/dir.x。背向射线的 t<0；平行射线没有唯一交点。',
  },
  'ray-parameter': {
    title: '参数 t 与路程',
    family: 'ray',
    note: '把 dir 放大两倍，交点不变，t 减半，路程 |t|·|dir| 不变。只有单位 dir 时非负 t 才等于前进距离。',
  },
  'nonunit-normal': {
    title: '非单位 N 与投影向量',
    family: 'dot',
    note: 'proj_N(V)=N·dot(V,N)/dot(N,N)。放大 N 不改变投影向量，但会改变原始 dot；有符号长度为 dot(V,N)/|N|。',
  },
  'cross-area': {
    title: 'Cross · 有向面积向量',
    family: 'cross',
    note: '默认 A=(2,1,0)、B=(1,2,1)：C=(1,-2,3)，面积 √14。法线同时垂直 A、B；面积单位是长度的平方。',
  },
  'cross-order': {
    title: '绕序与反向',
    family: 'cross',
    note: '点击交换 A/B，平行四边形不变，C 反向。cross(A,B)=-cross(B,A)，方向由有序输入和坐标约定决定。',
  },
  'cross-magnitude': {
    title: '底乘高就是 Cross 的长度',
    family: 'cross',
    note: '面积=|A|·|B⊥|=|A×B|。单位向量也会随夹角改变面积；平行时为 0，垂直时最大。',
  },
  'cross-projected-area': {
    title: 'YZ / ZX / XY 有向投影面积',
    family: 'cross',
    note: 'Cx=AyBz−AzBy，Cy=AzBx−AxBz，Cz=AxBy−AyBx。注意第二个投影使用 ZX 顺序；符号来自二维绕序。',
  },
  'area-reconstruction': {
    title: '恢复真实三维面积',
    family: 'cross',
    note: '真实面积=√(Cx²+Cy²+Cz²)，不是投影面积相加。旋转观察相机不改变 C；改变实际向量方向才会改变投影面积。',
  },
  'dot-vs-cross': {
    title: '平行分量与垂直分量',
    family: 'dot',
    note: '启用单位输入：dot²+|cross|²=1。一般向量则为 dot²+|cross|²=|A|²|B|²；投影与余量正交。',
  },
  'triangle-normal': {
    title: 'Triangle Normal · 顶点与绕序',
    family: 'triangle',
    note: '可拖 P0/P1/P2。C=(P1−P0)×(P2−P0)，三角形面积=|C|/2。交换 P1/P2 后法线反向；共线时不能归一化。',
  },
  'shader-frame': {
    title: 'TBN 与植被 Bend Axis',
    family: 'cross',
    note: 'A 表示主轴/法线，B 表示风/切线候选。B 去除沿 A 的分量得到切向量；axis=normalize(A×B)。风沿主轴时弯曲轴无定义。',
  },
  'numerical-boundaries': {
    title: 'Grazing 与退化',
    family: 'ray',
    note: '点击平行、背向或零向量预设，观察无交点、负 t 和无定义状态。演示使用相对角度阈值 1e−6；阈值属于应用策略。',
  },
} as const;
export type LabId = keyof typeof labs;
