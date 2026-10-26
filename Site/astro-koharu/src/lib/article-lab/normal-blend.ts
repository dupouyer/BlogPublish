import { add, dot, scale, unit, type Vec3 } from './math';

export type Method = 'lerp' | 'rnm' | 'sg';
export const normal = (x: number, y: number): Vec3 => unit([x, y, 1]) as Vec3;
// Decoded unit normals in one orthonormal tangent frame, with z > 0.
export function rnm(base: Vec3, detail: Vec3): Vec3 {
  const t = add(base, [0, 0, 1]);
  const u: Vec3 = [-detail[0], -detail[1], detail[2]];
  return unit(add(scale(t, dot(t, u) / t[2]), scale(u, -1))) as Vec3;
}
export function blend(ns: Vec3[], method: Method): Vec3 {
  if (method === 'sg') {
    const slope = ns.reduce((s, n) => [s[0] + n[0] / n[2], s[1] + n[1] / n[2]], [0, 0]);
    return normal(slope[0], slope[1]);
  }
  return ns.slice(1).reduce((a, b) => (method === 'rnm' ? rnm(a, b) : (unit(add(a, b)) as Vec3)), ns[0]);
}
export function layers(x: number, y: number, base: number, detail: number, frequency: number, count: number): Vec3[] {
  // Each pair is -grad(h) for a procedural height in this single flat frame.
  return [
    normal(base * Math.sin(x * 2), base * Math.cos(y * 2)),
    normal(detail * Math.sin(x * frequency), detail * Math.cos(y * frequency)),
    normal(detail * 0.65 * Math.cos((x + y) * frequency), detail * 0.65 * Math.cos((x + y) * frequency)),
    normal(detail * 0.45 * Math.sin((x - y) * frequency * 1.7), -detail * 0.45 * Math.sin((x - y) * frequency * 1.7)),
  ].slice(0, count);
}
export const angle = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;
