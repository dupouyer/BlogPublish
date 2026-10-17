import type { BufferGeometry, Material, NormalBufferAttributes } from 'three';

export function createRimScene(T: typeof import('three')) {
  const scene = new T.Scene();
  scene.background = new T.Color('#101c30');
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 180);
  const geometries: BufferGeometry<NormalBufferAttributes>[] = [];
  const materials: Material[] = [];
  function mesh(geometry: BufferGeometry<NormalBufferAttributes>, color: string, x: number, y: number, z: number) {
    const material = new T.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    scene.add(object);
    geometries.push(geometry);
    materials.push(material);
    return object;
  }
  function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
    return mesh(new T.BoxGeometry(w, h, d), color, x, y, z);
  }
  box(160, 0.2, 160, '#24394b', 0, -0.15, -30);
  box(1.65, 3.2, 1.5, '#547484', 0, 1.6, 0);
  box(2, 0.22, 1.85, '#a0b2ac', 0, 3.2, 0);
  mesh(new T.ConeGeometry(1.6, 1.2, 4), '#3a6167', 0, 3.9, 0).rotation.y = Math.PI / 4;
  box(0.4, 0.8, 0.08, '#172538', 0.25, 2.2, 0.79);
  box(0.6, 0.95, 0.1, '#19293d', -0.3, 0.48, 0.8);
  mesh(new T.CylinderGeometry(0.5, 0.65, 2.6, 12), '#7e9499', -2.2, 1.3, 0.5);
  mesh(new T.IcosahedronGeometry(0.8, 1), '#829990', 2, 1.2, 0.6);
  box(1.2, 0.4, 1.2, '#536e7b', 2, 0.2, 0.6);
  for (let i = 0; i < 7; i++) {
    const x = (i % 2 ? 1 : -1) * (3 + i * 0.35);
    box(1.2, 2 + (i % 3), 1.3, '#3a5669', x, 1 + (i % 3) / 2, -5 - i * 3);
  }
  scene.add(new T.HemisphereLight('#c3dce6', '#26384d', 2));
  const light = new T.DirectionalLight('#ffe3b1', 2.5);
  scene.add(light);
  return {
    scene,
    camera,
    light,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
