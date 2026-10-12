export interface PlotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Fit finite geometry into a centered 500:340 viewport, with room for labels. */
export function fitPlot(points: [number, number][], aspect = 500 / 340): PlotBounds {
  const finite = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!finite.length) return { x: 0, y: 0, width: 500, height: 340 };
  const xs = finite.map(([x]) => x),
    ys = finite.map(([, y]) => y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const pad = Math.max(20, Math.max(maxX - minX, maxY - minY) * 0.15);
  let width = maxX - minX + 2 * pad,
    height = maxY - minY + 2 * pad;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}
