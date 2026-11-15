import { describe, expect, it } from 'vitest';
import { position } from './atlas';
import { journeyPoint, outlook, planJourney } from './atlasPlan';

const day = 86400e3;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('atlas planner', () => {
  it('a trip to Mars leaves Earth, arrives exactly at Mars and stays between both orbits', () => {
    const j = planJourney('marte', Date.UTC(2026, 0, 1))!;
    expect((j.arrive - j.depart) / day).toBeGreaterThan(250);
    expect(dist(journeyPoint(j, 0), position('tierra', j.depart))).toBeLessThan(1e-6);
    expect(dist(journeyPoint(j, 1), position('marte', j.arrive))).toBeLessThan(1e-6);
    for (let i = 0; i <= 20; i++) {
      const p = journeyPoint(j, i / 20), r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThan(0.97);
      expect(r).toBeLessThan(1.7);
    }
  });

  it('a trip to Venus falls inward and arrives at Venus', () => {
    const j = planJourney('venus', Date.UTC(2026, 0, 1))!;
    expect(dist(journeyPoint(j, 1), position('venus', j.arrive))).toBeLessThan(1e-6);
    const mid = journeyPoint(j, 0.5), r = Math.hypot(mid.x, mid.y);
    expect(r).toBeLessThan(1.02);
    expect(r).toBeGreaterThan(0.7);
  });

  it('the craft moves faster near the Sun: an outward trip covers more than half the angle in the first half', () => {
    const j = planJourney('jupiter', Date.UTC(2026, 0, 1))!;
    const a0 = journeyPoint(j, 0), am = journeyPoint(j, 0.5), a1 = journeyPoint(j, 1);
    const ang = (p: { x: number; y: number }, q: { x: number; y: number }) => {
      let d = Math.atan2(q.y, q.x) - Math.atan2(p.y, p.x);
      while (d < 0) d += 2 * Math.PI;
      return d;
    };
    expect(ang(a0, am)).toBeGreaterThan(ang(am, a1));
  });

  it('the Moon can be reached any day', () => {
    const now = Date.UTC(2026, 10, 15);
    const j = planJourney('luna', now)!;
    expect(j.depart).toBe(now);
    expect((j.arrive - j.depart) / day).toBeGreaterThan(4);
  });

  it('solar panels and antennas get much weaker at Jupiter', () => {
    const date = Date.UTC(2026, 0, 1);
    const craft = { solarAtEarthW: 60, baseW: 15, rateLeo: 1.2 };
    const near = outlook('luna', date, craft), far = outlook('jupiter', date, craft);
    expect(near.solarW).toBeGreaterThan(55);
    expect(near.panelsShort).toBe(0);
    expect(far.solarW).toBeLessThan(3);
    expect(far.panelsShort).toBeGreaterThan(5);
    expect(far.kbps).toBeLessThan(1);
    expect(far.kbps).toBeGreaterThan(0.1);
    expect(far.photoTime).toBeGreaterThan(near.photoTime * 1000);
    expect(far.delay / 60).toBeGreaterThan(30);
  });

  it('a craft without an antenna sends nothing', () => {
    const o = outlook('marte', Date.UTC(2026, 0, 1), { solarAtEarthW: 8, baseW: 2, rateLeo: 0 });
    expect(o.kbps).toBe(0);
    expect(o.photoTime).toBe(Infinity);
  });
});
