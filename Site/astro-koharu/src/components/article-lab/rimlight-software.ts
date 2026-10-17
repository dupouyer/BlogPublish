import type { Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { type RimSettings, rimWidth } from '../../lib/article-lab/rimlight';
import { createRimScene } from './rimlight-scene';

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gamma = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055));

/** A small triangle rasterizer for devices without WebGL. Same meshes and depth-offset rules, simplified diffuse shading. */
export async function createRimSoftwareRenderer(canvas: HTMLCanvasElement) {
  const T = await import('three');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const { scene, camera, dispose } = createRimScene(T);
  scene.updateMatrixWorld(true);
  const triangles: { points: Vector3[]; normal: Vector3; color: number[] }[] = [];
  for (const child of scene.children) {
    if (!(child as Mesh).isMesh) continue;
    const mesh = child as Mesh;
    const geometry = mesh.geometry;
    const pos = geometry.getAttribute('position');
    const color = (mesh.material as MeshStandardMaterial).color;
    const count = geometry.index?.count ?? pos.count;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map((k) =>
        new T.Vector3().fromBufferAttribute(pos, geometry.index?.getX(i + k) ?? i + k).applyMatrix4(mesh.matrixWorld),
      );
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      triangles.push({ points, normal, color: [color.r, color.g, color.b] });
    }
  }
  function clipNear(points: Vector3[]) {
    const output: Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const insideA = a.z >= 0.1,
        insideB = b.z >= 0.1;
      if (insideA) output.push(a);
      if (insideA !== insideB) output.push(a.clone().lerp(b, (0.1 - a.z) / (b.z - a.z)));
    }
    return output;
  }
  let active = true;
  return {
    kind: 'Canvas 2D 软件后备',
    render(settings: RimSettings) {
      if (!active) return 0;
      const w = Math.round(Math.min(480, Math.max(240, canvas.clientWidth)) * settings.resolution);
      const h = Math.round(w * 0.68);
      canvas.width = w;
      canvas.height = h;
      camera.fov = settings.fov;
      camera.aspect = w / h;
      const orbit = (settings.orbit * Math.PI) / 180;
      camera.position.set(
        Math.sin(orbit) * settings.distance,
        2 + 0.12 * settings.distance,
        Math.cos(orbit) * settings.distance,
      );
      camera.lookAt(0, 2, 0);
      camera.updateMatrixWorld();
      const angle = (settings.angle * Math.PI) / 180;
      const light = new T.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize();
      const lightVS = light.clone().transformDirection(camera.matrixWorldInverse);
      const directionLength = Math.hypot(lightVS.x, lightVS.y);
      const dx = lightVS.x / Math.max(directionLength, 0.00001);
      const dy = -lightVS.y / Math.max(directionLength, 0.00001);
      const tan = Math.tan((settings.fov * Math.PI) / 360);
      const depths = new Float32Array(w * h).fill(180);
      const weights = new Float32Array(w * h);
      const surfaceMasks = new Float32Array(w * h);
      const colors = new Float32Array(w * h * 3);
      const background = new T.Color('#101c30');
      for (let i = 0; i < w * h; i++) colors.set([background.r, background.g, background.b], i * 3);
      const edge = (a: Vector3, b: Vector3, x: number, y: number) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      for (const tri of triangles) {
        if (tri.normal.dot(camera.position.clone().sub(tri.points[0])) <= 0) continue;
        const polygon = clipNear(
          tri.points.map((p) => {
            const v = p.clone().applyMatrix4(camera.matrixWorldInverse);
            v.z = -v.z;
            return v;
          }),
        );
        const nw = smooth(-0.15, 0.45, tri.normal.dot(light));
        const surfaceMask = 1 - smooth(0.65, 0.95, Math.abs(tri.normal.y));
        const brightness = 0.35 + 0.75 * Math.max(0, tri.normal.dot(light)) + 0.2 * Math.max(0, tri.normal.y);
        for (let t = 1; t + 1 < polygon.length; t++) {
          const [a, b, c] = [polygon[0], polygon[t], polygon[t + 1]].map(
            (p) => new T.Vector3((0.5 + p.x / (2 * p.z * tan * camera.aspect)) * w, (0.5 - p.y / (2 * p.z * tan)) * h, 1 / p.z),
          );
          const area = edge(a, b, c.x, c.y);
          if (Math.abs(area) < 1e-8) continue;
          const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
          const maxX = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
          const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
          const maxY = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
          for (let y = minY; y <= maxY; y++)
            for (let x = minX; x <= maxX; x++) {
              const u = edge(b, c, x + 0.5, y + 0.5) / area;
              const v = edge(c, a, x + 0.5, y + 0.5) / area;
              const q = 1 - u - v;
              if (u < -1e-6 || v < -1e-6 || q < -1e-6) continue;
              const z = 1 / (u * a.z + v * b.z + q * c.z);
              const i = y * w + x;
              if (z >= depths[i]) continue;
              depths[i] = z;
              weights[i] = nw;
              surfaceMasks[i] = surfaceMask;
              for (let k = 0; k < 3; k++) colors[i * 3 + k] = tri.color[k] * brightness;
            }
        }
      }
      const image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const { pixels, fade } = rimWidth(depths[i], h, settings);
          const sx = x + 0.5 + dx * pixels,
            sy = y + 0.5 + dy * pixels;
          const valid = sx >= 0.5 && sx <= w - 0.5 && sy >= 0.5 && sy <= h - 0.5;
          const z1 = valid ? depths[Math.floor(sy) * w + Math.floor(sx)] : depths[i];
          const mask =
            depths[i] < 176 && directionLength > 0.0001
              ? smooth(0.08, 0.35, Math.max(0, z1 - depths[i])) * (settings.normals ? weights[i] : 1) * surfaceMasks[i] * fade
              : 0;
          for (let k = 0; k < 3; k++) {
            let color = colors[i * 3 + k] + [1, 0.56, 0.22][k] * mask * 1.7;
            if (settings.debug === 1) color = Math.max(0, 1 - depths[i] / 65) ** 3;
            if (settings.debug === 2) color = mask;
            if (settings.debug === 3)
              color =
                depths[i] < 176
                  ? [0.03, 0.12, 0.3][k] + ([1, 0.45, 0.1][k] - [0.03, 0.12, 0.3][k]) * Math.min(1, pixels / 6)
                  : 0;
            image.data[i * 4 + k] = gamma(color);
          }
          image.data[i * 4 + 3] = 255;
        }
      ctx.putImageData(image, 0, 0);
      return h;
    },
    dispose() {
      active = false;
      triangles.length = 0;
      dispose();
    },
  };
}
