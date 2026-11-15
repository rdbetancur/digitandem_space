export interface Camera {
  /** Meters per CSS pixel. */
  zoom: number;
  targetZoom: number;
  rotation?: number;
}

export const isMapView = (cam: Camera) => cam.targetZoom > 300;

export function zoomCamera(cam: Camera, delta: number) {
  cam.targetZoom = Math.max(0.04, Math.min(4e5, cam.targetZoom * Math.exp(delta * 0.0016)));
}

export function updateCamera(cam: Camera, seconds: number, phi: number) {
  const blend = 1 - Math.exp(-6 * seconds);
  cam.zoom *= Math.exp(Math.log(cam.targetZoom / cam.zoom) * blend);
  const t = Math.max(0, Math.min(1, (Math.log10(cam.zoom) - 2.2) / 1.4));
  const mapBlend = t * t * (3 - 2 * t);
  const local = Math.atan2(Math.cos(phi), Math.sin(phi));
  const target = local * (1 - mapBlend);
  const previous = cam.rotation ?? local;
  // Interpolate the shortest rotation, including across atan2's branch cut.
  const difference = Math.atan2(Math.sin(target - previous), Math.cos(target - previous));
  cam.rotation = previous + difference * blend;
}

export function centerBlend(zoom: number, radius: number, w: number, h: number) {
  // Recenter only once the planet fits: a fixed zoom threshold throws the craft
  // off screen on small viewports during the transition.
  const t = Math.max(0, Math.min(1, (zoom * Math.min(w, h) / radius - 1.5) / 1));
  return t * t * (3 - 2 * t);
}
