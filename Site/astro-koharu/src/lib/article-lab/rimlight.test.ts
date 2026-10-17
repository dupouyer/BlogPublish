import assert from 'node:assert/strict';
import test from 'node:test';
import { rimDefaults, rimWidth } from './rimlight';

test('near width is capped, distant width follows inverse depth without a one-pixel floor', () => {
  const near = rimWidth(1, 540, rimDefaults);
  assert.equal(near.uv, rimDefaults.cap);
  const a = rimWidth(50, 540, rimDefaults);
  const b = rimWidth(100, 540, rimDefaults);
  assert.ok(a.pixels < 1 && b.pixels > 0);
  assert.ok(Math.abs(a.pixels / b.pixels - 2) < 1e-10);
  assert.ok(b.fade < a.fade);
});

test('fixed pixels stay constant; hybrid UV is resolution independent but pixel fade is not', () => {
  assert.equal(rimWidth(100, 1080, { ...rimDefaults, mode: 0 }).pixels, 4);
  const a = rimWidth(50, 540, rimDefaults);
  const b = rimWidth(50, 1080, rimDefaults);
  assert.equal(a.uv, b.uv);
  assert.equal(a.pixels * 2, b.pixels);
  assert.ok(b.fade > a.fade);
});
