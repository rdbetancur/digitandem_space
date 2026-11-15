import { describe, expect, it } from 'vitest';
import { RE } from '../sim/constants';
import { orbitOf } from '../sim/flight';
import { apsisAlt, pathAhead } from './renderer';

const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe('map path ahead of the craft', () => {
  // A low hop: 500 m up, climbing at 200 m/s with a little horizontal speed (apoapsis about 2.5 km).
  const r = { x: 0, y: RE + 500 };
  const climbing = { x: 50, y: 200 };

  it('the full-orbit line has no point above ground on a low hop (why the Ap line was missing)', () => {
    const o = orbitOf(r, climbing);
    let above = 0;
    for (let i = 0; i <= 240; i++) {
      const nu = (i / 240) * Math.PI * 2;
      if (o.p / (1 + o.e * Math.cos(nu)) > RE) above++;
    }
    // At most the sample that falls exactly on the apoapsis: one point draws no line.
    expect(above).toBeLessThan(2);
  });

  it('runs from the craft up to the apoapsis, above ground the whole way', () => {
    const o = orbitOf(r, climbing);
    const pts = pathAhead(r, climbing, o);
    expect(pts.length).toBeGreaterThan(100);
    expect(Math.abs(radius(pts[0]) - radius(r))).toBeLessThan(1);
    expect(Math.abs(radius(pts[pts.length - 1]) - o.ap)).toBeLessThan(1);
    expect(pts.every((p) => radius(p) >= radius(r) - 1)).toBe(true);
  });

  it('after apoapsis it runs down to the ground', () => {
    const falling = { x: 50, y: -100 };
    const o = orbitOf(r, falling);
    const pts = pathAhead(r, falling, o);
    expect(pts.length).toBeGreaterThan(10);
    expect(radius(pts[pts.length - 1])).toBeLessThan(RE + 50);
    expect(pts.every((p) => radius(p) >= RE)).toBe(true);
  });

  it('labels apsides in meters below 1 km', () => {
    expect(apsisAlt(640)).toBe('640 m');
    expect(apsisAlt(2040)).toBe('2.0 km');
    expect(apsisAlt(185_400)).toBe('185 km');
  });
});
