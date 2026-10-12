export type Vec3 = [number, number, number];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => add(a, scale(b, -1));
export const length = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 | null => (length(a) > 1e-8 ? scale(a, 1 / length(a)) : null);
export const projection = (a: Vec3, n: Vec3): Vec3 | null => (dot(n, n) > 1e-16 ? scale(n, dot(a, n) / dot(n, n)) : null);
export function rayPlane(origin: Vec3, dir: Vec3, point: Vec3, n: Vec3) {
  const denominator = dot(dir, n);
  if (!unit(dir) || !unit(n)) return { t: null, kind: 'invalid' } as const;
  if (Math.abs(denominator) <= 1e-6 * length(dir) * length(n)) {
    return { t: null, kind: Math.abs(dot(sub(point, origin), n)) < 1e-6 * length(n) ? 'coplanar' : 'parallel' } as const;
  }
  return { t: dot(sub(point, origin), n) / denominator, kind: 'hit' } as const;
}
