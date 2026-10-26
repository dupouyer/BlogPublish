import { useEffect, useRef, useState } from 'react';
import { dot, unit, type Vec3 } from '../../lib/article-lab/math';
import { angle, blend, layers, type Method } from '../../lib/article-lab/normal-blend';

const methods: Method[] = ['lerp', 'rnm', 'sg'];
const names = ['Naive sequential lerp · t=0.5', 'RNM · sequential', 'SG · common-frame slope sum'];
export default function NormalBlendLab() {
  const [count, setCount] = useState(2);
  const [base, setBase] = useState(0.8);
  const [detail, setDetail] = useState(0.35);
  const [frequency, setFrequency] = useState(12);
  const [light, setLight] = useState(35);
  const [reverse, setReverse] = useState(false);
  const [rgb, setRgb] = useState(false);
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const size = 180;
    const pixels = ctx.createImageData(size * 3, size);
    const rad = (light * Math.PI) / 180;
    const l = unit([Math.cos(rad), Math.sin(rad), 0.65]) as Vec3;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const ns = layers((x / size) * 6, (y / size) * 6, base, detail, frequency, count);
        if (reverse) ns.reverse();
        methods.forEach((method, i) => {
          const n = blend(ns, method);
          const diffuse = 0.12 + 0.88 * Math.max(0, dot(n, l));
          const color = rgb ? n.map((v) => (v * 0.5 + 0.5) * 255) : [diffuse * 140, diffuse * 195, diffuse * 235];
          const offset = (y * size * 3 + i * size + x) * 4;
          pixels.data.set([...color, 255], offset);
        });
      }
    ctx.putImageData(pixels, 0, 0);
    setReady(true);
  }, [base, detail, frequency, count, light, reverse, rgb]);
  const ns = layers(0.7, 0.4, base, detail, frequency, count);
  const ordered = reverse ? [...ns].reverse() : ns;
  return (
    <div className="normal-blend">
      <div className="controls">
        <label>
          层数{' '}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value="2">2 层 A/B</option>
            <option value="4">4 层 A/B/C/D</option>
          </select>
        </label>
        {(
          [
            ['Base 坡度强度', base, setBase, 0, 2, 0.05],
            ['Detail 坡度强度', detail, setDetail, 0, 1.2, 0.05],
            ['细节频率', frequency, setFrequency, 2, 24, 1],
            ['光照方位（度）', light, setLight, 0, 360, 1],
          ] as const
        ).map(([title, value, setter, min, max, step]) => (
          <label key={title} className="normal-blend-slider">
            {title}：{value}
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => setter(Number(e.target.value))}
            />
          </label>
        ))}
        <label>
          <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
          反转全部层顺序
        </label>
        <label>
          <input type="checkbox" checked={rgb} onChange={(e) => setRgb(e.target.checked)} />
          显示法线 RGB
        </label>
      </div>
      <p>
        顺序：{reverse ? (count === 2 ? 'B → A' : 'D → C → B → A') : count === 2 ? 'A → B' : 'A → B → C → D'}
        。所有算法共享输入强度与光照。
      </p>
      {!ready && (
        <img
          src="/img/posts/normal-blending-lerp-rnm-surface-gradient/default.webp"
          alt="默认两层的实际着色结果，从左到右为 Lerp、RNM、SG；Base 0.8、Detail 0.35、频率 12、光照方位 35 度"
          width="540"
          height="180"
          style={{ width: '100%', height: 'auto' }}
        />
      )}
      <canvas
        ref={canvas}
        width="540"
        height="180"
        aria-label="从左到右：逐层 Lerp、RNM、SG 的平面程序化凹凸比较"
        style={{ display: ready ? 'block' : 'none', width: '100%', height: 'auto', marginTop: 16 }}
      />
      <div className="normal-blend-labels" aria-hidden="true">
        <span>Lerp</span>
        <span>RNM</span>
        <span>SG</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption>固定探针 (u,v)=(0.7,0.4)，单位法线与全顺序反转角差</caption>
          <thead>
            <tr>
              <th>方法（与上图顺序一致）</th>
              <th>当前法线</th>
              <th>反转角差</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m, i) => (
              <tr key={m}>
                <th>{names[i]}</th>
                <td>
                  {blend(ordered, m)
                    .map((v) => v.toFixed(3))
                    .join(', ')}
                </td>
                <td>{angle(blend(ns, m), blend([...ns].reverse(), m)).toFixed(3)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        平面、同一正交 TBN、正 z 输入；仅 Lambert 着色，无几何位移、遮挡或 UE 性能模拟。2 层等权 Lerp 可交换，4
        层串接会偏向后加入层。频率只改变图案，不自动放大坡度。
      </p>
    </div>
  );
}
