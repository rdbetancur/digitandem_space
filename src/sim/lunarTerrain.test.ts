import { describe, expect, it } from 'vitest';
import { LUNAR_DATA, LUNAR_PROFILE } from './lunarData';
import { lunarCoordinates, terrainElevation, terrainRadius } from './lunarTerrain';
import { lunarEnvironment, LUNAR_DAY_H, LUNAR_SHADOWS } from './lunarEnvironment';
import { createLuna, localFrame, powerBalance, predictPath, SITE_ANGLE, stepDescent } from './luna';

describe('NASA lunar data', () => {
  it('retains the LOLA reference radius and measured relief in meters', () => {
    expect(LUNAR_PROFILE).toHaveLength(5760);
    expect(LUNAR_DATA.sha256).toHaveLength(64);
    expect(terrainElevation(SITE_ANGLE)).toBeCloseTo(-347, 0);
    expect(Math.min(...LUNAR_PROFILE)).toBe(-7893);
    expect(Math.max(...LUNAR_PROFILE)).toBe(6487);
    expect(terrainElevation(0)).toBeCloseTo(terrainElevation(2 * Math.PI), 7);
    expect(lunarCoordinates(SITE_ANGLE).lat).toBeCloseTo(-89, 7);
  });
  it('uses the same measured surface for radar, impact prediction and contact', () => {
    const s = createLuna();
    const a = SITE_ANGLE, radius = terrainRadius(a);
    s.r = { x: (radius + 0.01) * Math.cos(a), y: (radius + 0.01) * Math.sin(a) };
    s.v = { x: -Math.cos(a), y: -Math.sin(a) };
    s.pitch = 0; s.assist = 'manual';
    expect(localFrame(s).alt).toBeCloseTo(0.01, 5);
    expect(predictPath(s, 2).impact).not.toBeNull();
    stepDescent(s, 0.1);
    expect(s.touchdown).not.toBeNull();
    expect(localFrame(s).alt).toBeCloseTo(0, 6);
  });
  it('models polar illumination and temperature without terrestrial weather', () => {
    for (let h = 0; h < 240; h++) {
      const e = lunarEnvironment(h);
      expect(e.wind).toBe(0); expect(e.precipitation).toBe(0);
      expect(e.solarElevation).toBeGreaterThan(0.5);
      expect(e.solarElevation).toBeLessThan(2.6);
      expect(e.groundTemperatureC).toBeGreaterThanOrEqual(-173.15);
      expect(e.groundTemperatureC).toBeLessThan(-80);
      expect(lunarEnvironment(h + LUNAR_DAY_H).solarElevation).toBeCloseTo(e.solarElevation, 8);
    }
    expect(LUNAR_SHADOWS.length).toBeGreaterThan(0);
    const [start, end] = LUNAR_SHADOWS[0];
    expect(end).toBeGreaterThan(240);
    expect(lunarEnvironment(start - 0.25).lit).toBe(true);
    expect(lunarEnvironment((start + end) / 2).lit).toBe(false);
    expect(lunarEnvironment(end).lit).toBe(true);
    const s = createLuna(); s.panels = true;
    expect(powerBalance(s).gen).toBeGreaterThan(7900);
    s.hours = (start + end) / 2;
    expect(powerBalance(s).gen).toBe(0);
  });
});
