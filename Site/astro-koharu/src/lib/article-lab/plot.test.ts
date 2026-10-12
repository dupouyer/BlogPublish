import assert from 'node:assert/strict';
import test from 'node:test';
import { fitPlot } from './plot';

test('fit is centered, preserves viewport aspect and contains every point', () => {
  for (const points of [
    [
      [250, 155],
      [300, 155],
      [250, 105],
    ],
    [
      [-100, 400],
      [800, -30],
      [0, 0],
    ],
  ] as [number, number][][]) {
    const b = fitPlot(points);
    assert.ok(Math.abs(b.width / b.height - 500 / 340) < 1e-10);
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    assert.equal(b.x + b.width / 2, (Math.min(...xs) + Math.max(...xs)) / 2);
    assert.equal(b.y + b.height / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    for (const [x, y] of points) assert.ok(x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height);
  }
});
test('empty and degenerate geometry keeps finite positive bounds', () => {
  for (const points of [[], [[0, 0]], [[NaN, Infinity]]] as [number, number][][]) {
    const b = fitPlot(points);
    assert.ok(Object.values(b).every(Number.isFinite));
    assert.ok(b.width > 0 && b.height > 0);
  }
});

test('coordinate plane thumbnails preserve their own aspect', () => {
  const b = fitPlot(
    [
      [0, 0],
      [120, -40],
    ],
    180 / 160,
  );
  assert.ok(Math.abs(b.width / b.height - 180 / 160) < 1e-10);
});
