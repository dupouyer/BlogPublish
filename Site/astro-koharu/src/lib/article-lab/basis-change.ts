import { add, dot, scale, type Vec3 } from './math';

export const FIXTURE_TILT = (Math.asin(0.6) * 180) / Math.PI;
export const WORLD_VECTOR: Vec3 = [0, 0, 1];
export const MESH_FRAME: [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Analytic right-handed orthonormal frame; roll rotates T/B about fixed N. */
export function basisFrame(tilt: number, azimuth: number, roll: number): [Vec3, Vec3, Vec3] {
  const [t, a, r] = [tilt, azimuth, roll].map((v) => (v * Math.PI) / 180);
  const tangent: Vec3 = [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), -Math.sin(t)];
  const bitangent: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const normal: Vec3 = [Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t)];
  return [
    add(scale(tangent, Math.cos(r)), scale(bitangent, Math.sin(r))),
    add(scale(tangent, -Math.sin(r)), scale(bitangent, Math.cos(r))),
    normal,
  ];
}
export function basisCoordinates(v: Vec3, frame: [Vec3, Vec3, Vec3]): Vec3 {
  return frame.map((axis) => dot(v, axis)) as Vec3;
}
export function basisReconstruct(c: Vec3, frame: [Vec3, Vec3, Vec3]): Vec3 {
  return add(add(scale(frame[0], c[0]), scale(frame[1], c[1])), scale(frame[2], c[2]));
}
