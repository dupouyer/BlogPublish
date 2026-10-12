import assert from 'node:assert/strict';
import test from 'node:test';
import { add, cross, dot, length, projection, rayPlane, scale, unit, type Vec3 } from './math';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('signed projected areas, perpendicularity and Lagrange identity', () => {
  const a: Vec3 = [2, 1, 0];
  const b: Vec3 = [1, 2, 1];
  const c = cross(a, b);
  assert.deepEqual(c, [1, -2, 3]);
  near(length(c), Math.sqrt(14));
  near(dot(c, a), 0);
  near(dot(c, b), 0);
  near(dot(a, b) ** 2 + length(c) ** 2, dot(a, a) * dot(b, b));
  cross(b, a).forEach((v, i) => {
    near(v, -c[i]);
  });
});
test('non-unit normal projection and scalar linearity', () => {
  const a: Vec3 = [2, 1, 0];
  const n: Vec3 = [3, 0, 0];
  assert.deepEqual(projection(a, n), [2, 0, 0]);
  near(dot(scale(a, -2), n), -2 * dot(a, n));
  near(dot(a, scale(n, -2)), -2 * dot(a, n));
  near(dot(add(a, n), n), dot(a, n) + dot(n, n));
  assert.equal(projection(a, [0, 0, 0]), null);
  assert.equal(unit([0, 0, 0]), null);
});
test('ray scaling, signed parameters, grazing and coplanar cases', () => {
  const o: Vec3 = [0, 0, 0];
  const q: Vec3 = [2, 0, 0];
  assert.equal(rayPlane(o, [2, 1, 0], q, [3, 0, 0]).t, 1);
  assert.equal(rayPlane(o, [4, 2, 0], q, [1, 0, 0]).t, 0.5);
  assert.equal(rayPlane(o, [-1, 0, 0], q, [1, 0, 0]).t, -2);
  assert.equal(rayPlane(o, [0, 1, 0], q, [1, 0, 0]).kind, 'parallel');
  assert.equal(rayPlane(o, [0, 1, 0], o, [1, 0, 0]).kind, 'coplanar');
  assert.equal(rayPlane(o, [0, 0, 0], q, [1, 0, 0]).kind, 'invalid');
});
