import { describe, expect, it } from 'vitest';
import { MU, RE } from '../sim/constants';
import { createFlight, orbitOf, setThrottle, stepFlight } from '../sim/flight';
import { MISSIONS } from '../sim/missions';
import { circularizationEstimate } from './circularization';
import { flightGuide, GuideState } from './flightGuidance';

function atApoapsis(speed = 7500) {
  const f = createFlight(MISSIONS.cubesat.preset);
  f.landed = false;
  f.stats.liftoffT = 0;
  f.stageIdx = 1;
  f.fairingOn = false;
  f.r = { x: 0, y: RE + 166e3 };
  f.v = { x: speed, y: 0 };
  f.heading = 0;
  f.sas = 'prograda';
  return f;
}

describe('manual orbital insertion', () => {
  it('raises periapsis above the atmosphere with a prograde burn at 166 km', () => {
    const f = atApoapsis();
    const before = orbitOf(f.r, f.v).pe;
    const estimate = circularizationEstimate(f)!;
    expect(estimate.dv).toBeCloseTo(Math.sqrt(MU / (RE + 166e3)) - 7500, 6);
    setThrottle(f, 1);
    while (f.t < 100 && !f.ended && orbitOf(f.r, f.v).pe - RE < 150e3) stepFlight(f, 0.02);
    expect(f.ended).toBeNull();
    expect(orbitOf(f.r, f.v).pe).toBeGreaterThan(before);
    expect(orbitOf(f.r, f.v).pe - RE).toBeGreaterThan(150e3);
    expect(f.stages[1].prop).toBeGreaterThan(0);
  });

  it('starts a long insertion burn earlier and detects insufficient fuel', () => {
    const f = atApoapsis(4000);
    const burn = circularizationEstimate(f)!;
    expect(burn.seconds).toBeGreaterThan(100);
    const state: GuideState = {
      launched: true, landed: false, ended: null, alt: 150e3, ap: 166e3, pe: -1000e3,
      toAp: 60, vr: 100, throttle: 0, twr: 0, free: false, fairing: false,
      deployed: false, canDeploy: true, orbiting: false,
      stages: [{ fill: 1, active: true, gone: false }], circularization: burn,
    };
    expect(flightGuide(state).title).toBe('Raise the periapsis');
    f.stages[1].prop = 10;
    expect(flightGuide({ ...state, circularization: circularizationEstimate(f) }).title).toBe('Not enough delta-v for orbit');
  });
});
