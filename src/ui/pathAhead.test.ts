import { describe, expect, it } from 'vitest';
import { MU, RE } from '../sim/constants';
import { groundVelocity, orbitOf } from '../sim/flight';
import { apsisAlt, groundPath, pathAhead } from './renderer';

const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe('suborbital path relative to the ground', () => {
  // Straight up from the ground: the rocket also carries the Earth's eastward spin (groundVelocity).
  const r = { x: 0, y: RE + 500 };
  const spin = groundVelocity(r);
  const v = { x: spin.x, y: spin.y + 200 };
  const o = orbitOf(r, v);

  it('a rocket fired straight up comes back down near its pad, not kilometres downrange', () => {
    const g = groundPath(r, v, o)!;
    const end = g.pts[g.pts.length - 1];
    const offPad = Math.abs(Math.atan2(end.y, end.x) - Math.PI / 2) * RE;
    expect(offPad).toBeLessThan(1000);
  });

  it('the apoapsis sits above the pad, where the old space-coordinates drawing put it kilometres east', () => {
    const offset = (p: { x: number; y: number }) => Math.abs(Math.atan2(p.y, p.x) - Math.PI / 2) * RE;
    const g = groundPath(r, v, o)!;
    expect(offset(g.pts[g.apIdx!])).toBeLessThan(200);
    const inertial = pathAhead(r, v, o); // ends at the apoapsis
    expect(offset(inertial[inertial.length - 1])).toBeGreaterThan(5000);
  });

  it('starts at the craft, stays above ground, ends on it, and marks the true apoapsis', () => {
    const g = groundPath(r, v, o)!;
    expect(Math.abs(radius(g.pts[0]) - radius(r))).toBeLessThan(1);
    expect(g.pts.every((p) => radius(p) >= RE - 1)).toBe(true);
    expect(Math.abs(radius(g.pts[g.pts.length - 1]) - RE)).toBeLessThan(1);
    expect(g.apIdx).not.toBeNull();
    expect(Math.abs(radius(g.pts[g.apIdx!]) - o.ap)).toBeLessThan(50);
  });

  it('a falling craft gets a path to the ground and no apoapsis marker', () => {
    const down = { x: spin.x, y: spin.y - 150 };
    const g = groundPath(r, down, orbitOf(r, down))!;
    expect(g.apIdx).toBeNull();
    expect(Math.abs(radius(g.pts[g.pts.length - 1]) - RE)).toBeLessThan(1);
  });

  it('a steep climb to ~400 km is one smooth arc: no straight jumps (the "triangle")', () => {
    const rh = { x: 0, y: RE + 116e3 };
    const sp = groundVelocity(rh);
    const vh = { x: sp.x + 300, y: sp.y + 2600 };
    const oh = orbitOf(rh, vh);
    const g = groundPath(rh, vh, oh)!;
    let total = 0, longest = 0;
    for (let i = 1; i < g.pts.length; i++) {
      const d = Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y);
      total += d; longest = Math.max(longest, d);
    }
    expect(longest).toBeLessThan(total * 0.02);
    expect(g.pts.every((p) => radius(p) >= RE - 1)).toBe(true);
    expect(Math.abs(radius(g.pts[g.apIdx!]) - oh.ap)).toBeLessThan(500);
  });

  it('a real orbit has no ground path, so it keeps the full ellipse', () => {
    const rc = { x: RE + 200e3, y: 0 };
    const vc = { x: 0, y: -Math.sqrt(MU / (RE + 200e3)) };
    expect(groundPath(rc, vc, orbitOf(rc, vc))).toBeNull();
  });
});

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
