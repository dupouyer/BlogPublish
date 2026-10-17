import { useEffect, useRef, useState } from 'react';
import { type RimSettings, rimDefaults, rimWidth } from '../../lib/article-lab/rimlight';
import { createRimRenderer } from './rimlight-renderer';

export default function RimLightLab() {
  const [settings, setSettings] = useState<RimSettings>({ ...rimDefaults });
  const [status, setStatus] = useState('正在加载 3D 实验；下方静态图与正文可先阅读。');
  const [height, setHeight] = useState(540);
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Awaited<ReturnType<typeof createRimRenderer>> | null>(null);
  const current = useRef(settings);
  current.current = settings;
  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    const node = canvas.current;
    if (!node) return;
    const onLoss = (event: Event) => {
      event.preventDefault();
      setReady(false);
      setStatus('图形上下文已中断。可刷新重试；静态图和数值仍可阅读。');
    };
    node.addEventListener('webglcontextlost', onLoss);
    createRimRenderer(node)
      .then((instance) => {
        if (!active) {
          instance.dispose();
          return;
        }
        engine.current = instance;
        const redraw = () => setHeight(instance.render(current.current));
        redraw();
        observer = new ResizeObserver(redraw);
        observer.observe(node);
        setReady(true);
        setStatus('3D 已就绪。先切近景 / 远景，再比较三种宽度模式。');
      })
      .catch(() => {
        if (active) setStatus('当前设备无法启动 WebGL。静态图、宽度数值和正文公式仍可使用。');
      });
    return () => {
      active = false;
      observer?.disconnect();
      node.removeEventListener('webglcontextlost', onLoss);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    if (engine.current) setHeight(engine.current.render(settings));
  }, [settings]);
  const update = <K extends keyof RimSettings>(key: K, value: RimSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const centerZ = settings.distance * Math.sqrt(1 + 0.12 ** 2);
  const measured = rimWidth(centerZ, height, settings);
  const slider = (
    key: 'distance' | 'fov' | 'width' | 'cap' | 'angle' | 'orbit',
    title: string,
    min: number,
    max: number,
    step: number,
    value: string,
  ) => (
    <label className="rim-slider">
      <span>
        {title} <strong>{value}</strong>
      </span>
      <input
        aria-label={title}
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => update(key, Number(e.target.value))}
      />
    </label>
  );
  return (
    <div className="rim-lab">
      <div className="rim-view">
        {!ready && (
          <img src="/img/posts/stylized-rimlight-depth-width/width.svg" alt="固定像素、世界宽度和混合宽度随视深度的静态曲线" />
        )}
        <canvas ref={canvas} aria-label="真实 3D 模型的深度偏移边缘光" style={{ visibility: ready ? 'visible' : 'hidden' }} />
        <span className="rim-badge">{['固定 4 px', '世界宽度投影', '混合：投影 + 上限'][settings.mode]}</span>
      </div>
      <output>{status}</output>
      <div className="buttons">
        <button type="button" onClick={() => update('distance', 4)}>
          近景 · 4 m
        </button>
        <button type="button" onClick={() => update('distance', 12)}>
          中景 · 12 m
        </button>
        <button type="button" onClick={() => update('distance', 55)}>
          远景 · 55 m
        </button>
        <button type="button" onClick={() => setSettings({ ...rimDefaults })}>
          重置
        </button>
      </div>
      <div className="rim-selects">
        <label>
          宽度模式
          <select value={settings.mode} onChange={(e) => update('mode', Number(e.target.value))}>
            <option value={0}>固定像素 · 4 px</option>
            <option value={1}>固定世界宽度投影</option>
            <option value={2}>混合 · 近处限制 / 远处缩小</option>
          </select>
        </label>
        <label>
          观察通道
          <select value={settings.debug} onChange={(e) => update('debug', Number(e.target.value))}>
            <option value={0}>最终颜色</option>
            <option value={1}>线性深度</option>
            <option value={2}>边缘光 Mask</option>
            <option value={3}>偏移像素宽度 · 蓝小橙大</option>
          </select>
        </label>
      </div>
      <div className="controls">
        {slider('distance', '相机距离', 3.5, 70, 0.5, `${settings.distance.toFixed(1)} m`)}
        {slider('width', '视平面宽度', 0.01, 0.2, 0.005, `${(settings.width * 100).toFixed(1)} cm`)}
        {slider('cap', '近处高度占比上限', 0.002, 0.03, 0.001, `${(settings.cap * 100).toFixed(1)} %`)}
        {slider('fov', '垂直 FOV', 30, 85, 1, `${settings.fov}°`)}
        {slider('angle', '世界主光仰角', -25, 155, 1, `${settings.angle}°`)}
        {slider('orbit', '绕模型观察', -55, 55, 1, `${settings.orbit}°`)}
      </div>
      <div className="rim-options">
        <label>
          <input type="checkbox" checked={settings.fade} onChange={(e) => update('fade', e.target.checked)} />
          亚像素淡出
        </label>
        <label>
          <input type="checkbox" checked={settings.normals} onChange={(e) => update('normals', e.target.checked)} />
          法线方向调制
        </label>
        <label>
          渲染分辨率
          <select value={settings.resolution} onChange={(e) => update('resolution', Number(e.target.value))}>
            <option value={1}>100%</option>
            <option value={0.5}>50%</option>
          </select>
        </label>
      </div>
      <div className="readout" aria-live="polite">
        模型中心参考：Z ≈ {centerZ.toFixed(2)} m · 渲染高 {height} px
        <br />
        偏移 {measured.pixels.toFixed(3)} px · 淡出权重 {measured.fade.toFixed(3)}
      </div>
      <p>逐像素使用各自的深度，上面只读模型中心。固定像素模式始终为 4 px。混合模式近处封顶、远处不设最小像素值。</p>
      <p>
        浏览器说明性实现：程序化不透明模型、单方向深度采样、独立法线 Pass；没有 UE 的 TAA、曝光、Shading Model
        或阴影可见性。亚像素淡出是显式抑制策略，并非精确覆盖率。
      </p>
    </div>
  );
}
