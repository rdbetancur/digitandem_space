import { describe, expect, it } from 'vitest';
import { flightGuide, GuideState } from './flightGuidance';
import { ATM_TOP, RE } from '../sim/constants';
import { altitude, canDeploy, createFlight, deploy, orbitOf, payloadOnly, stageAction, stepFlight, timeToApsides } from '../sim/flight';
import { MISSIONS } from '../sim/missions';

const pad: GuideState = {
  launched: false, landed: true, ended: null, alt: 0, ap: 0, pe: -6000e3,
  toAp: Infinity, vr: 0, throttle: 0, twr: 0, free: false, fairing: true,
  deployed: false, canDeploy: false, orbiting: false,
  stages: [{ fill: 1, active: true, gone: false }],
};
const ascent: GuideState = { ...pad, launched: true, landed: false, alt: 2000, throttle: 1, twr: 1.4 };
const orbit: GuideState = { ...ascent, alt: 200e3, pe: 180e3, ap: 220e3, orbiting: true, fairing: false };

describe('guía del primer vuelo', () => {
  it('lleva de encendido a inclinación según el vuelo real', () => {
    expect(flightGuide(pad).step).toBe(1);
    expect(flightGuide({ ...ascent, alt: 500 }).title).toBe('Gana altura');
    expect(flightGuide(ascent).title).toBe('Inclina hacia el este');
    expect(flightGuide({ ...pad, throttle: 1, twr: 0.8 }).text).toContain('laboratorio');
  });
  it('prioriza separar una etapa agotada antes de seguir acelerando', () => {
    expect(flightGuide({ ...ascent, alt: 110e3, stages: [{ fill: 0, active: true, gone: false }] }).step).toBe(3);
    expect(flightGuide({ ...ascent, stages: [{ fill: 0, active: false, gone: true }, { fill: 1, active: true, gone: false }] }).step).toBe(2);
  });
  it('distingue costa y circularización sin confundir altura con órbita', () => {
    expect(flightGuide({ ...ascent, ap: 180e3, vr: 500, toAp: 100 }).title).toBe('Espera cerca del apoapsis');
    expect(flightGuide({ ...ascent, alt: 170e3, ap: 180e3, toAp: 25 }).title).toBe('Eleva el periapsis');
    expect(flightGuide({ ...orbit, orbiting: false }).step).toBe(4);
  });
  it('no pide soltar la última etapa hasta alcanzar órbita', () => {
    expect(flightGuide(orbit).step).toBe(5);
    expect(flightGuide({ ...ascent, free: true }).title).toBe('La nave quedó sin motor');
  });
  it('espera las condiciones de despliegue y reconoce el final', () => {
    const satellite = { ...orbit, free: true };
    expect(flightGuide({ ...satellite, fairing: true }).text).toContain('cofia');
    expect(flightGuide(satellite).text).toContain('sin empuje');
    expect(flightGuide({ ...satellite, canDeploy: true }).text).toContain('Pulsa G');
    expect(flightGuide({ ...satellite, deployed: true }).title).toBe('¡Primer vuelo completado!');
  });

  it('acompaña el preset CubeSat desde la plataforma hasta el despliegue en órbita', () => {
    const f = createFlight(MISSIONS.cubesat.preset);
    const currentGuide = () => {
      const o = orbitOf(f.r, f.v);
      return flightGuide({
        ...pad, launched: f.stats.liftoffT !== null, landed: f.landed, ended: f.ended,
        alt: altitude(f), ap: o.ap - RE, pe: o.pe - RE,
        toAp: timeToApsides(f.r, f.v, o).toAp,
        vr: (f.r.x * f.v.x + f.r.y * f.v.y) / Math.hypot(f.r.x, f.r.y),
        free: payloadOnly(f), fairing: f.fairingOn, deployed: f.deployed, canDeploy: canDeploy(f),
        orbiting: !f.landed && o.e < 1 && o.pe - RE > ATM_TOP,
        stages: f.stages.map((s, i) => ({ fill: s.prop / s.propMax, active: i === f.stageIdx, gone: i < f.stageIdx })),
      });
    };
    expect(currentGuide().step).toBe(1);
    f.autopilot = true;
    const seen = new Set<number>();
    while (f.t < 600 && !f.ended && f.autopilot) {
      stepFlight(f, 0.02);
      seen.add(currentGuide().step);
    }
    expect(f.ended).toBeNull();
    expect(seen.has(2)).toBe(true);
    expect(seen.has(4)).toBe(true);
    expect(currentGuide().step).toBe(5);
    stageAction(f);
    stepFlight(f, 0.02);
    expect(currentGuide().step).toBe(6);
    expect(canDeploy(f)).toBe(true);
    deploy(f);
    expect(currentGuide().title).toBe('¡Primer vuelo completado!');
  });
});
