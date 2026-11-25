export const TILE_SIZE = 256;
export const MAX_ZOOM = 17;
export const MIN_ZOOM = 1;
const MAX_LAT = 85.05112878;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Pixel {
  x: number;
  y: number;
}

export interface MapView {
  z: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TileRef {
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

export function worldPx(p: LatLon, z: number): Pixel {
  const size = TILE_SIZE * 2 ** z;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat)) * (Math.PI / 180);
  return {
    x: ((p.lon + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size,
  };
}

export function fitView(points: readonly LatLon[], width: number, height: number, pad: number): MapView | null {
  if (points.length === 0 || width <= 2 * pad || height <= 2 * pad) return null;
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const px = points.map((p) => worldPx(p, z));
    const minX = Math.min(...px.map((p) => p.x));
    const maxX = Math.max(...px.map((p) => p.x));
    const minY = Math.min(...px.map((p) => p.y));
    const maxY = Math.max(...px.map((p) => p.y));
    if (maxX - minX <= width - 2 * pad && maxY - minY <= height - 2 * pad) {
      return { z, left: (minX + maxX) / 2 - width / 2, top: (minY + maxY) / 2 - height / 2, width, height };
    }
  }
  return null;
}

export function project(view: MapView, p: LatLon): Pixel {
  const w = worldPx(p, view.z);
  return { x: w.x - view.left, y: w.y - view.top };
}

export function visibleTiles(view: MapView): TileRef[] {
  const count = 2 ** view.z;
  const out: TileRef[] = [];
  const x0 = Math.floor(view.left / TILE_SIZE);
  const x1 = Math.floor((view.left + view.width - 1) / TILE_SIZE);
  const y0 = Math.max(0, Math.floor(view.top / TILE_SIZE));
  const y1 = Math.min(count - 1, Math.floor((view.top + view.height - 1) / TILE_SIZE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      out.push({ z: view.z, x: ((tx % count) + count) % count, y: ty, left: tx * TILE_SIZE - view.left, top: ty * TILE_SIZE - view.top });
    }
  }
  return out;
}
