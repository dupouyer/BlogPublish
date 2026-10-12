import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { add, cross, dot, length, projection, rayPlane, scale, sub, unit, type Vec3 } from '../../lib/article-lab/math';
import { type LabId, labs } from '../../lib/article-lab/registry';

const fmt = (n: number) => (Math.abs(n) < 0.00005 ? '0' : n.toFixed(3));
const vec = (v: Vec3 | null) => (v ? `(${v.map(fmt).join(', ')})` : '无定义');
const initialA: Vec3 = [2, 1, 0];
function VectorLabContent({ id }: { id: LabId }) {
  const lab = labs[id];
  const isCross = lab.family === 'cross' || lab.family === 'triangle';
  const [a, setA] = useState<Vec3>(initialA);
  const [b, setB] = useState<Vec3>(isCross ? [1, 2, 1] : [1, 0, 0]);
  const [p0, setP0] = useState<Vec3>([0, 0, 0]);
  const [scalar, setScalar] = useState(2);
  const [depth, setDepth] = useState(2);
  const [normalized, setNormalized] = useState(id === 'unit-cos' || id === 'dot-vs-cross');
  const [yaw, setYaw] = useState(30);
  const [drag, setDrag] = useState<'a' | 'b' | 'p0' | null>(null);
  const A = normalized && lab.family !== 'triangle' ? unit(a) : a;
  const B = lab.family === 'ray' ? ([1, 0, 0] as Vec3) : normalized && lab.family !== 'triangle' ? unit(b) : b;
  const valid = A !== null && B !== null;
  const av = A ?? [0, 0, 0];
  const bv = B ?? [0, 0, 0];
  const edgeA = lab.family === 'triangle' ? sub(av, p0) : av;
  const edgeB = lab.family === 'triangle' ? sub(bv, p0) : bv;
  const c = cross(edgeA, edgeB);
  const d = dot(av, bv);
  const proj = projection(av, bv);
  const perp = proj ? sub(av, proj) : null;
  const cos = length(av) * length(bv) > 1e-8 ? d / (length(av) * length(bv)) : null;
  const angle = cos === null ? null : (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  const ray = rayPlane([0, 0, 0], av, [depth, 0, 0], [1, 0, 0]);
  const hit = ray.t === null ? null : scale(av, ray.t);
  const yawRad = (yaw * Math.PI) / 180;
  const project3 = (v: Vec3): [number, number] => [
    250 + 40 * (v[0] * Math.cos(yawRad) + v[2] * Math.sin(yawRad)),
    155 - 40 * (v[1] + 0.35 * (-v[0] * Math.sin(yawRad) + v[2] * Math.cos(yawRad))),
  ];
  const project2 = (v: Vec3): [number, number] => [250 + 40 * v[0], 155 - 40 * v[1]];
  const point = isCross ? project3 : project2;
  const line = (start: Vec3, end: Vec3, color: string, label: string, dashed = false) => {
    const s = point(start);
    const e = point(end);
    return (
      <g>
        <line
          x1={s[0]}
          y1={s[1]}
          x2={e[0]}
          y2={e[1]}
          stroke={color}
          strokeWidth="3"
          strokeDasharray={dashed ? '5 5' : undefined}
        />
        <circle cx={e[0]} cy={e[1]} r="4" fill={color} />
        <text x={e[0] + 8} y={e[1] - 8} fill={color}>
          {label}
        </text>
      </g>
    );
  };
  const origin: Vec3 = lab.family === 'triangle' ? p0 : [0, 0, 0];
  const poly = (vs: Vec3[]) => vs.map((v) => point(v).join(',')).join(' ');
  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const pointer = event.currentTarget.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const { x, y } = pointer.matrixTransform(matrix.inverse());
    const prior = drag === 'a' ? a : drag === 'b' ? b : p0;
    // 3D handles move in the world XY plane while preserving Z, solving the displayed oblique projection.
    const vx = Math.max(
      -3,
      Math.min(3, ((x - 250) / 40 - (isCross ? prior[2] * Math.sin(yawRad) : 0)) / (isCross ? Math.cos(yawRad) : 1)),
    );
    const vy = Math.max(
      -3,
      Math.min(3, (155 - y) / 40 - (isCross ? 0.35 * (-vx * Math.sin(yawRad) + prior[2] * Math.cos(yawRad)) : 0)),
    );
    const next: Vec3 = [vx, vy, prior[2]];
    (drag === 'a' ? setA : drag === 'b' ? setB : setP0)(next);
  };
  const handle = (v: Vec3, name: 'a' | 'b' | 'p0', color: string) => {
    const p = point(v);
    return (
      <circle
        cx={p[0]}
        cy={p[1]}
        r="12"
        fill={color}
        fillOpacity="0.4"
        style={{ touchAction: 'none' }}
        stroke={color}
        onPointerDown={(e) => {
          e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
          setDrag(name);
        }}
      />
    );
  };
  const controlVector = (value: Vec3, name: string, setter: (v: Vec3) => void) => (
    <fieldset>
      <legend>{name}</legend>
      {value.map((v, i) => (
        <label key={`${name}-${'xyz'[i]}`}>
          {'xyz'[i]}{' '}
          <input
            aria-label={`${name} ${'xyz'[i]}`}
            type="range"
            min="-3"
            max="3"
            step="0.01"
            value={v}
            onChange={(e) => {
              const next: Vec3 = [...value];
              next[i] = Number(e.target.value);
              setter(next);
            }}
          />
          <span>{fmt(v)}</span>
        </label>
      ))}
    </fieldset>
  );
  return (
    <div className="vector-lab">
      <p className="legend">
        青色 {isCross ? 'A / P1' : 'V / dir'} · 金色 {isCross ? 'B / P2' : 'N'} · 紫色 {isCross ? 'C = cross' : '投影'}
        。拖动圆点改变 XY，滑块改变 XYZ；面积图为可旋转的正交投影；Dot/Ray 主图是 XY 视图，Z 参加数值计算。
      </p>
      <svg
        viewBox="0 0 500 310"
        role="img"
        aria-label={lab.title}
        onPointerMove={handleMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <title>{`${lab.title}，拖动端点或使用下方滑块`}</title>
        {(
          [
            [3, 0, 0],
            [0, 3, 0],
            [0, 0, 3],
          ] as Vec3[]
        )
          .slice(0, isCross ? 3 : 2)
          .map((v, i) => (
            <g key={'xyz'[i]}>{line([0, 0, 0], v, '#718096', 'xyz'[i])}</g>
          ))}
        {isCross && (
          <polygon
            points={lab.family === 'triangle' ? poly([p0, av, bv]) : poly([origin, av, add(av, bv), bv])}
            fill="#38bdf8"
            fillOpacity="0.17"
            stroke="#38bdf8"
          />
        )}
        {line(origin, av, '#22d3ee', lab.family === 'triangle' ? 'P1' : 'A / V')}
        {line(origin, bv, '#fbbf24', lab.family === 'triangle' ? 'P2' : 'B / N')}
        {isCross
          ? line(origin, add(origin, scale(unit(c) ?? [0, 0, 0], 1.5)), '#c084fc', 'Ĉ（显示定长）')
          : proj && (
              <>
                {line([0, 0, 0], proj, '#c084fc', 'proj')}
                {line(proj, av, '#c084fc', 'V⊥', true)}
              </>
            )}
        {lab.family === 'ray' && (
          <>
            <line x1={250 + 40 * depth} y1="10" x2={250 + 40 * depth} y2="300" stroke="#fb7185" strokeDasharray="5 5" />
            <text x={255 + 40 * depth} y="25" fill="#fb7185">
              x=depth
            </text>
            {hit && length(hit) < 9 && line([0, 0, 0], hit, '#fb7185', '交点')}
          </>
        )}
        {handle(av, 'a', '#22d3ee')}
        {lab.family !== 'ray' && handle(bv, 'b', '#fbbf24')}
        {lab.family === 'triangle' && handle(p0, 'p0', '#fb7185')}
      </svg>
      {isCross && (
        <div className="projections">
          {(
            [
              [1, 2, 'YZ', c[0]],
              [2, 0, 'ZX', c[1]],
              [0, 1, 'XY', c[2]],
            ] as const
          ).map(([i, j, name, area]) => (
            <figure key={name}>
              <svg viewBox="0 0 180 160" role="img" aria-label={`${name} 有向投影面积 ${fmt(area)}`}>
                <title>{`${name} 有向投影`}</title>
                <line x1="10" y1="110" x2="175" y2="110" stroke="#718096" />
                <line x1="65" y1="5" x2="65" y2="150" stroke="#718096" />
                <polygon
                  points={[
                    [0, 0],
                    [edgeA[i], edgeA[j]],
                    [edgeA[i] + edgeB[i], edgeA[j] + edgeB[j]],
                    [edgeB[i], edgeB[j]],
                  ]
                    .map(([x, y]) => `${65 + 18 * x},${110 - 18 * y}`)
                    .join(' ')}
                  fill="#c084fc"
                  fillOpacity="0.3"
                  stroke="#c084fc"
                />
                <text x="145" y="130">
                  {'xyz'[i]}
                </text>
                <text x="75" y="16">
                  {'xyz'[j]}
                </text>
              </svg>
              <figcaption>
                {name} → C{'xyz'[[1, 2, 0].indexOf(i)]} = {fmt(area)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="readout" aria-live="polite">
        {!valid && <p>零向量不能归一化：夹角 / 单位方向无定义。</p>}
        <p>
          dot(A,B) = {fmt(d)} · cosθ = {cos === null ? '无定义' : fmt(cos)} · θ = {angle === null ? '无定义' : `${fmt(angle)}°`}
        </p>
        <p>
          C = {vec(c)} · |C| = {fmt(length(c))}
          {lab.family === 'triangle' && ` · 三角形面积 = ${fmt(length(c) / 2)}`}
        </p>
        {!isCross && (
          <p>
            proj = {vec(proj)} · 有符号长度 = {length(bv) > 1e-8 ? fmt(d / length(bv)) : '无定义'} · |V⊥| ={' '}
            {perp ? fmt(length(perp)) : '无定义'}
          </p>
        )}
        {lab.family === 'linearity' && (
          <>
            <p>
              t·dot = {fmt(scalar * d)} · dot(tA,B) = {fmt(dot(scale(av, scalar), bv))} · dot(A,tB) ={' '}
              {fmt(dot(av, scale(bv, scalar)))}
            </p>
            <p>
              dot(B,A) = {fmt(dot(bv, av))} · dot(A+B,B) = {fmt(dot(add(av, bv), bv))} = dot(A,B)+dot(B,B) ={' '}
              {fmt(d + dot(bv, bv))}
            </p>
          </>
        )}
        {lab.family === 'ray' && (
          <>
            <p>
              dir·N = {fmt(av[0])} · 已知 t={fmt(scalar)} → depth = {fmt(scalar * av[0])}
            </p>
            <p>
              已知 depth={fmt(depth)} → t = {ray.t === null ? `${ray.kind}（无唯一交点）` : fmt(ray.t)} · 路程 ={' '}
              {ray.t === null ? '无定义' : fmt(Math.abs(ray.t) * length(av))}
            </p>
            <p>
              {ray.t !== null && ray.t < 0
                ? '交点在背后：不属于 t≥0 的射线。'
                : ray.t !== null && length(hit ?? [0, 0, 0]) >= 9
                  ? '交点超出图示范围，保留数值。'
                  : '红线是平面；dir 非单位时 t 不等于距离。'}
            </p>
          </>
        )}
        {isCross && (
          <>
            <p>
              底 |A| = {fmt(length(edgeA))} · 高 |B⊥A| ={' '}
              {projection(edgeB, edgeA) ? fmt(length(sub(edgeB, projection(edgeB, edgeA) ?? [0, 0, 0]))) : '无定义'} ·
              √(Cx²+Cy²+Cz²) = {fmt(Math.hypot(...c))}
            </p>
            <p>
              dot(C,A) = {fmt(dot(c, edgeA))} · dot(C,B) = {fmt(dot(c, edgeB))} · 单位法线 = {vec(unit(c))}
            </p>
          </>
        )}
        {id === 'shader-frame' && (
          <p>
            T = {vec(unit(sub(bv, projection(bv, av) ?? bv)))} · bend axis = {vec(unit(c))} · B = handedness × cross(N,T)
          </p>
        )}
        <p>
          dot²+|A×B|² = {fmt(d * d + length(cross(av, bv)) ** 2)} · |A|²|B|² = {fmt(dot(av, av) * dot(bv, bv))}
        </p>
      </div>
      <div className="controls">
        {controlVector(a, lab.family === 'triangle' ? 'P1' : 'A / V / dir', setA)}
        {lab.family !== 'ray' && controlVector(b, lab.family === 'triangle' ? 'P2' : 'B / N', setB)}
        {lab.family === 'triangle' && controlVector(p0, 'P0', setP0)}
      </div>
      <div className="options">
        <label>
          <input type="checkbox" checked={normalized} onChange={(e) => setNormalized(e.target.checked)} />{' '}
          使用单位输入（零向量报无定义）
        </label>
        {(lab.family === 'ray' || lab.family === 'linearity') && (
          <label>
            参数 t{' '}
            <input
              type="range"
              min="-3"
              max="3"
              step="0.01"
              value={scalar}
              onChange={(e) => setScalar(Number(e.target.value))}
            />
            {fmt(scalar)}
          </label>
        )}
        {lab.family === 'ray' && (
          <label>
            平面 depth{' '}
            <input type="range" min="-3" max="3" step="0.01" value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
            {fmt(depth)}
          </label>
        )}
        {isCross && (
          <label>
            观察角 <input type="range" min="-65" max="65" value={yaw} onChange={(e) => setYaw(Number(e.target.value))} />
            {yaw}°（仅相机）
          </label>
        )}
      </div>
      <div className="buttons">
        <button
          type="button"
          onClick={() => {
            setA(initialA);
            setB(isCross ? [1, 2, 1] : [1, 0, 0]);
            setP0([0, 0, 0]);
            setScalar(2);
            setDepth(2);
            setYaw(30);
            setNormalized(id === 'unit-cos' || id === 'dot-vs-cross');
          }}
        >
          重置
        </button>
        <button
          type="button"
          onClick={() => {
            setA(b);
            setB(a);
          }}
        >
          交换 A/B
        </button>
        <button
          type="button"
          onClick={() => {
            setA([0, 1, 0]);
            setB([0, 2, 0]);
          }}
        >
          平行 / grazing
        </button>
        <button type="button" onClick={() => setA([-1, 1, 0])}>
          背向
        </button>
        <button type="button" onClick={() => setA([0, 0, 0])}>
          零向量
        </button>
      </div>
    </div>
  );
}

export default function VectorLab({ id }: { id: LabId }) {
  return (
    <ErrorBoundary fallback={<p>交互初始化失败，请阅读本页静态说明或返回文章。</p>}>
      <VectorLabContent id={id} />
    </ErrorBoundary>
  );
}
