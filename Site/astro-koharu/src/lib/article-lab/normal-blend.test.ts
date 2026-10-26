import assert from 'node:assert/strict';
import test from 'node:test';
import type { Vec3 } from './math';
import { blend, normal, rnm } from './normal-blend';

const near = (a: Vec3, b: Vec3) =>
  a.forEach((v, i) => {
    assert.ok(Math.abs(v - b[i]) < 1e-12);
  });
const flat: Vec3 = [0, 0, 1];
const a = normal(0.75, 0);
const b = normal(-0.2, 0.7);
const c = normal(0.4, -0.1);
const d = normal(-0.1, -0.5);
test('flat identity and lerp flattening counterexample', () => {
  near(rnm(a, flat), a);
  near(rnm(flat, b), b);
  near(blend([a, flat], 'sg'), a);
  assert.ok(blend([a, flat], 'lerp')[2] > a[2]);
});
test('SG recovers summed slopes and is invariant under permutation', () => {
  near(blend([a, b], 'sg'), normal(0.55, 0.7));
  near(blend([a, b, c, d], 'sg'), blend([d, c, b, a], 'sg'));
});
test('two-layer lerp commutes; four-layer lerp and RNM have order counterexamples', () => {
  near(blend([a, b], 'lerp'), blend([b, a], 'lerp'));
  for (const method of ['lerp', 'rnm'] as const) {
    const x = blend([a, b, c, d], method);
    const y = blend([d, c, b, a], method);
    assert.ok(Math.hypot(...x.map((v, i) => v - y[i])) > 1e-4);
  }
});
test('RNM preserves angular distance of detail from its reference up direction', () => {
  const out = rnm(a, b);
  near([Math.hypot(...out), out[0] * a[0] + out[1] * a[1] + out[2] * a[2], 0], [1, b[2], 0]);
});
