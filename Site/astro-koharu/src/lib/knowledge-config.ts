export interface KnowledgeGroup {
  id: string;
  title: string;
  description: string;
  stages: { id: string; title: string; description: string; planned?: string[] }[];
  foundations?: string[];
}

// Metadata lives here once; article membership and reading order live in frontmatter.
export const learningSeries: KnowledgeGroup[] = [
  {
    id: 'linear-algebra-for-ta',
    title: 'TA 真正需要的线性代数',
    description: '从方向与面积建立几何直觉，再把投影、基底与手性带回真实的 Shader 问题。',
    stages: [
      { id: 'geometry', title: '方向与测量', description: '先理解 Dot、Cross、投影与射线距离。' },
      {
        id: 'coordinates',
        title: '表面坐标系',
        description: '把几何直觉用于 TBN、镜像与法线。',
        planned: ['基变换：沿坐标轴测量与重建', '非均匀缩放下的法线变换'],
      },
      {
        id: 'applications',
        title: '真实材质问题',
        description: '在玻璃、植被与阴影中复用同一套数学。',
        planned: ['从法线厚度到玻璃光程', '从角散布到模糊足迹'],
      },
    ],
  },
];

export const topicCollections: KnowledgeGroup[] = [
  {
    id: 'realtime-glass',
    title: '一块玻璃里的实时渲染',
    description: '沿一条光线梳理折射、吸收与模糊，也可以直接从当前材质问题进入。',
    foundations: ['dot-cross-linear-algebra', 'normal-map-mirror-symmetry'],
    stages: [
      {
        id: 'refraction',
        title: '光线如何穿过玻璃',
        description: '先明确界面、方向与传播距离。',
        planned: ['双界面折射与 Exit Position', '光程、Beer-Lambert 与颜色吸收', 'Fresnel、临界角与 TIR'],
      },
      {
        id: 'blur',
        title: '从粗糙度到模糊',
        description: '理解角散布如何变成背景上的采样范围。',
        planned: ['Roughness × Distance 的模糊模型', '从传播距离到 Mip 近似'],
      },
      {
        id: 'layering',
        title: '复杂玻璃与分层背景',
        description: '让各层法线、遮挡与透射承担明确职责。',
        planned: ['压花玻璃的宏观与微观法线', '窗帘、室内与背景的分层透射'],
      },
    ],
  },
  {
    id: 'normal-mapping',
    title: '法线与表面细节',
    description: '从异常光照追溯采样、坐标基底与资产坡度，建立可重复的法线检查方法。',
    foundations: ['dot-cross-linear-algebra'],
    stages: [{ id: 'debug', title: '镜像与资产诊断', description: '区分采样位置、方向解释与浮雕本身的变化。' }],
  },
  {
    id: 'foliage',
    title: '生产级植被材质',
    description: '把结构、枢轴与实例数据连成一套系统，贯通风动、颜色与季节变化。',
    foundations: ['dot-cross-linear-algebra'],
    stages: [{ id: 'structure', title: '结构驱动的材质', description: '从部件数据到可复用的风动和季节控制。' }],
  },
  {
    id: 'agent-engineering',
    title: 'Agent 工程实践',
    description: '围绕任务描述、验证与长期维护，探索个人开发者可以持续使用的协作方式。',
    stages: [{ id: 'workflow', title: '协作与验证', description: '让输出可理解、改动可审查、工程可持续。' }],
  },
];

export const seriesById = new Map(learningSeries.map((item) => [item.id, item]));
export const collectionById = new Map(topicCollections.map((item) => [item.id, item]));
