export interface RimSettings {
  distance: number;
  fov: number;
  width: number;
  cap: number;
  angle: number;
  orbit: number;
  mode: number;
  debug: number;
  fade: boolean;
  normals: boolean;
  resolution: number;
}

export const rimDefaults: RimSettings = {
  distance: 8,
  fov: 50,
  width: 0.06,
  cap: 0.012,
  angle: 25,
  orbit: 18,
  mode: 2,
  debug: 0,
  fade: true,
  normals: true,
  resolution: 1,
};

/** Perspective, square pixels. Width is a view-plane distance, not a surface geodesic. */
export function rimWidth(z: number, height: number, settings: RimSettings) {
  const worldUV = settings.width / (2 * Math.max(z, 0.001) * Math.tan((settings.fov * Math.PI) / 360));
  const uv = settings.mode === 0 ? 4 / height : settings.mode === 1 ? worldUV : Math.min(worldUV, settings.cap);
  const pixels = uv * height;
  const t = Math.min(1, Math.max(0, pixels));
  return { uv, pixels, fade: settings.fade ? t * t * (3 - 2 * t) : 1 };
}
