import { LUNAR_DATA, LUNAR_PROFILE } from './lunarData';

export const LUNAR_RADIUS = LUNAR_DATA.referenceRadiusM;
export function lunarCoordinates(theta: number) {
  const a = theta + 49 * Math.PI / 180;
  return { lat: Math.asin(-Math.sin(a)) * 180 / Math.PI, lon: Math.cos(a) >= 0 ? 0 : -180 };
}

/** Bilinear DEM samples along the mission's meridian, linearly interpolated in flight. */
export function terrainElevation(theta: number): number {
  const index = ((theta / (2 * Math.PI) % 1 + 1) % 1) * LUNAR_PROFILE.length;
  const i = Math.floor(index), f = index - i;
  return LUNAR_PROFILE[i] * (1 - f) + LUNAR_PROFILE[(i + 1) % LUNAR_PROFILE.length] * f;
}
export const terrainRadius = (theta: number) => LUNAR_RADIUS + terrainElevation(theta);
export function terrainSlope(theta: number) {
  const d = 0.5 / LUNAR_DATA.pixelsPerDegree * Math.PI / 180;
  return Math.atan2(terrainElevation(theta + d) - terrainElevation(theta - d), 2 * d * LUNAR_RADIUS);
}
