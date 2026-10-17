import assert from 'node:assert/strict';
import test from 'node:test';
import { rimDefaults } from '../../lib/article-lab/rimlight';
import { createRimSoftwareRenderer } from './rimlight-software';

test('software path rasterizes the real 3D scene and distant hybrid rim fades below fixed pixels', async () => {
  let pixels: Uint8ClampedArray = new Uint8ClampedArray();
  const canvas = {
    clientWidth: 480,
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        pixels = image.data;
      },
    }),
  } as unknown as HTMLCanvasElement;
  const renderer = await createRimSoftwareRenderer(canvas);
  try {
    renderer.render({ ...rimDefaults, debug: 1 });
    const levels = new Set(pixels.filter((_, i) => i % 4 === 0));
    assert.ok(levels.size > 20, 'the depth image must contain multiple rasterized surfaces');
    const energy = () => pixels.reduce((sum, value, i) => sum + (i % 4 === 0 ? value : 0), 0);
    renderer.render({ ...rimDefaults, debug: 2, distance: 55, mode: 0 });
    const fixed = energy();
    renderer.render({ ...rimDefaults, debug: 2, distance: 55, mode: 2 });
    const hybrid = energy();
    assert.ok(fixed > 0);
    assert.ok(fixed > hybrid * 3, `fixed=${fixed}, hybrid=${hybrid}`);
  } finally {
    renderer.dispose();
  }
});
