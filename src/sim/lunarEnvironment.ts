import { LUNAR_DATA, SITE_HORIZON } from './lunarData';

/** Mean synodic day; solar geometry is a repeatable southern-summer scenario, not live telemetry. */
export const LUNAR_DAY_H = 29.53059 * 24;
const RAD = Math.PI / 180;
export function lunarEnvironment(hours: number) {
  const lat = LUNAR_DATA.site.lat * RAD, dec = -1.54 * RAD;
  // Choose an arrival window with a long illuminated working period; not a calendar ephemeris.
  const hourAngle = -Math.PI / 2 + (154 + hours) * 2 * Math.PI / LUNAR_DAY_H;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle));
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI + 2 * Math.PI) % (2 * Math.PI);
  const index = azimuth / (2 * Math.PI) * SITE_HORIZON.length;
  const i = Math.floor(index), f = index - i;
  const horizon = SITE_HORIZON[i] * (1 - f) + SITE_HORIZON[(i + 1) % SITE_HORIZON.length] * f;
  const lit = elevation / RAD > horizon;
  // Simplified radiative equilibrium, not air temperature or a Diviner observation.
  const temperatureK = (100 ** 4 + (390 ** 4 - 100 ** 4) * (lit ? Math.max(0, Math.sin(elevation)) : 0)) ** 0.25;
  return { lit, solarElevation: elevation / RAD, solarAzimuth: azimuth / RAD, horizon,
    groundTemperatureC: temperatureK - 273.15, panelFactor: lit ? Math.cos(elevation) : 0,
    wind: 0, precipitation: 0 };
}

/** Predicted intervals from the DEM horizon, used for crew planning. */
export function shadowWindows(duration = 240): [number, number][] {
  const windows: [number, number][] = [];
  let start: number | null = null;
  // Follow the final shadow to its real end, even if it outlasts the mission.
  for (let h = 0; h <= duration + LUNAR_DAY_H; h += 0.25) {
    const dark = !lunarEnvironment(h).lit;
    if (dark && start === null && h < duration) start = h;
    if (!dark && start !== null) { windows.push([start, h]); start = null; }
    if (h >= duration && start === null) break;
  }
  return windows;
}
export const LUNAR_SHADOWS = shadowWindows();
