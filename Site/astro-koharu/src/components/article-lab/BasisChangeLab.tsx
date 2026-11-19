import { useId, useState } from 'react';
import {
  basisCoordinates,
  basisFrame,
  basisReconstruct,
  FIXTURE_TILT,
  MESH_FRAME,
  WORLD_VECTOR,
} from '../../lib/article-lab/basis-change';
import { add, length, scale, sub, type Vec3 } from '../../lib/article-lab/math';

const colors = ['#ea647c', '#25b69b', '#728eff'];
const fmt = (n: number) => (Math.abs(n) < 0.0005 ? '0.000' : n.toFixed(3));
const vec = (v: Vec3) => `(${v.map(fmt).join(', ')})`;
function FrameView({ frame, name, yaw, prefix }: { frame: [Vec3, Vec3, Vec3]; name: string; yaw: number; prefix: string }) {
  const c = basisCoordinates(WORLD_VECTOR, frame);
  const reconstructed = basisReconstruct(c, frame);
  const project = (v: Vec3) => {
    const a = (yaw * Math.PI) / 180;
    return [
      200 + 105 * (v[0] * Math.cos(a) - v[1] * Math.sin(a)),
      175 + 42 * (v[0] * Math.sin(a) + v[1] * Math.cos(a)) - 105 * v[2],
    ];
  };
  const points: Vec3[] = [[0, 0, 0], scale(frame[0], c[0]), add(scale(frame[0], c[0]), scale(frame[1], c[1])), reconstructed];
  const line = (from: Vec3, to: Vec3, color: string, width: number, dashed = false) => {
    const p = project(from),
      q = project(to);
    return (
      <line
        x1={p[0]}
        y1={p[1]}
        x2={q[0]}
        y2={q[1]}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? '5 5' : undefined}
      />
    );
  };
  return (
    <section className="basis-panel">
      <h2>{name}</h2>
      <svg viewBox="0 0 400 330" role="img" aria-labelledby={`${prefix}-title ${prefix}-desc`}>
        <title id={`${prefix}-title`}>{name}：同一世界方向的测量与重建</title>
        <desc id={`${prefix}-desc`}>
          白色粗箭头是固定 V=(0,0,1)，彩色虚线是三个有符号分量首尾相加，终点与 V 重合。坐标 {vec(c)}。
        </desc>
        {[-1, 0, 1].map((n) => (
          <g key={n} opacity="0.2">
            {line([-1, n, 0], [1, n, 0], 'currentColor', 1)}
            {line([n, -1, 0], [n, 1, 0], 'currentColor', 1)}
          </g>
        ))}
        {frame.map((axis, i) => {
          const q = project(scale(axis, 1.12));
          return (
            <g key={['T', 'B', 'N'][i]}>
              {line(scale(axis, -0.65), scale(axis, 1.15), colors[i], 2)}
              <circle cx={q[0]} cy={q[1]} r="4" fill={colors[i]} />
              <text x={q[0] + 7} y={q[1] - 9} fontSize="15">
                {['X / T', 'Y / B', 'Z / N'][i]}
              </text>
            </g>
          );
        })}
        {line([0, 0, 0], WORLD_VECTOR, 'currentColor', 6)}
        <path d="M194 80 L200 67 L206 80" fill="none" stroke="currentColor" strokeWidth="3" />
        <text x="214" y="64" fontSize="15">
          V 固定
        </text>
        {colors.map((color, i) => (
          <g key={color}>
            {line(points[i], points[i + 1], color, 4, true)}
            <circle cx={project(points[i + 1])[0]} cy={project(points[i + 1])[1]} r="5" fill={color} />
          </g>
        ))}
        <circle cx="200" cy="70" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="20" y="307" fontSize="14">
          虚线：xT → yB → zN，圆环：重建终点
        </text>
      </svg>
      <dl>
        {c.map((value, i) => (
          <div key={colors[i]}>
            <dt>
              <span style={{ color: colors[i] }}>●</span> {['X = V·T', 'Y = V·B', 'Z = V·N'][i]}
            </dt>
            <dd>{fmt(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="basis-result">重建 V = {vec(reconstructed)}</p>
    </section>
  );
}
export default function BasisChangeLab() {
  const id = useId();
  const [tilt, setTilt] = useState(FIXTURE_TILT);
  const [azimuth, setAzimuth] = useState(0);
  const [roll, setRoll] = useState(0);
  const [yaw, setYaw] = useState(28);
  const frame = basisFrame(tilt, azimuth, roll);
  const c = basisCoordinates(WORLD_VECTOR, frame);
  const reconstructed = basisReconstruct(c, frame);
  const slider = (label: string, value: number, setter: (v: number) => void, min: number, max: number) => (
    <label>
      {label}
      <output>{value.toFixed(2)}°</output>
      <input type="range" min={min} max={max} step="0.1" value={value} onChange={(e) => setter(Number(e.target.value))} />
    </label>
  );
  return (
    <div className="basis-lab">
      <p className="basis-lead">箭头不动，只换测量方向的三把尺子。先倾斜 N，再只转动 T / B，观察坐标和重建终点。</p>
      <div className="basis-buttons">
        <button
          type="button"
          onClick={() => {
            setTilt(FIXTURE_TILT);
            setAzimuth(0);
            setRoll(0);
            setYaw(28);
          }}
        >
          精确例子：N=(0.6,0,0.8)
        </button>
        <button
          type="button"
          onClick={() => {
            setTilt(0);
            setAzimuth(0);
            setRoll(0);
          }}
        >
          平法线复位
        </button>
        <button type="button" onClick={() => setRoll((r) => ((r + 90 + 180) % 360) - 180)}>
          固定 N，绕转 +90°
        </button>
      </div>
      <div className="basis-controls">
        {slider('① N 倾角', tilt, setTilt, 0, 180)}
        {slider('② N 方位角', azimuth, setAzimuth, -180, 180)}
        {slider('③ 绕固定 N 转动 T / B', roll, setRoll, -180, 180)}
        {slider('仅旋转观察视角（不改坐标）', yaw, setYaw, -180, 180)}
      </div>
      <div className="basis-panels">
        <FrameView frame={MESH_FRAME} name="原网格基（本例 = 世界 XYZ）" yaw={yaw} prefix={`${id}-mesh`} />
        <FrameView frame={frame} name="新着色基（T′ / B′ / N′）" yaw={yaw} prefix={`${id}-new`} />
      </div>
      <div className="basis-summary" aria-live="polite">
        <p>
          <strong>新坐标</strong> {vec(c)}　<strong>重建误差</strong>{' '}
          {length(sub(reconstructed, WORLD_VECTOR)).toExponential(1)}
        </p>
        <p>xT′ + yB′ + zN′ = {vec(reconstructed)}，始终是同一个世界向量。</p>
      </div>
      <details>
        <summary>查看当前三根单位轴（世界坐标）</summary>
        <p>
          T′ = {vec(frame[0])}
          <br />
          B′ = {vec(frame[1])}
          <br />
          N′ = {vec(frame[2])}
        </p>
      </details>
      <p className="basis-boundary">
        只转③：N 不变，Z 分量不变，但 X / Y 会变。图中灰网格是世界 XY
        平面，正交投影视图不用于量取屏幕角度。本实验构造右手单位正交基，非正交基不能直接用三次 dot 求坐标；这里不模拟 UE
        的切线手性或实际材质执行。
      </p>
    </div>
  );
}
