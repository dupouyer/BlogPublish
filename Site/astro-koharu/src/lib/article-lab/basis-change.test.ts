import assert from 'node:assert/strict';
import test from 'node:test';
import { basisCoordinates, basisFrame, basisReconstruct, FIXTURE_TILT, WORLD_VECTOR } from './basis-change';
import { cross, dot } from './math';

const near = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) => {
    assert.ok(Math.abs(v - expected[i]) < 1e-12, `${actual} != ${expected}`);
  });
test('exact tilted fixture and fixed-normal quarter turn', () => {
  const f = basisFrame(FIXTURE_TILT, 0, 0);
  near(f[0], [0.8, 0, -0.6]);
  near(f[1], [0, 1, 0]);
  near(f[2], [0.6, 0, 0.8]);
  near(basisCoordinates(WORLD_VECTOR, f), [-0.6, 0, 0.8]);
  const rotated = basisFrame(FIXTURE_TILT, 0, 90);
  near(rotated[2], f[2]);
  near(rotated[0], f[1]);
  near(basisCoordinates(WORLD_VECTOR, rotated), [0, 0.6, 0.8]);
});
test('full slider domain preserves orthonormality, handedness and reconstruction', () => {
  for (const t of [0, FIXTURE_TILT, 90, 135, 180])
    for (const a of [-180, -75, 0, 90, 180])
      for (const r of [-180, -90, 0, 38, 180]) {
        const f = basisFrame(t, a, r);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near([dot(f[i], f[j])], [i === j ? 1 : 0]);
        near(cross(f[0], f[1]), f[2]);
        for (const v of [WORLD_VECTOR, [2, -3, 4] as [number, number, number]])
          near(basisReconstruct(basisCoordinates(v, f), f), v);
      }
});
