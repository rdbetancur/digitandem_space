import { describe, expect, it } from 'vitest';
import {
  FLARE, FLARE_WARN, Luna, MU_MOON, R_MOON, SAFE_VV, SHADOW, SITE_RADIUS, SURVIVE_H,
  brakingDistance, createLuna, localFrame, lunaAction, lunaObjectives, lunaReport, predictPath, setThrottle,
  siteDistance, stepDescent, stepSurface,
} from './luna';

/** Piloto de prueba: espera, frena en retrógrado y baja vertical con el asistente. */
function pilot(s: Luna, margin = 1) {
  let braking = false;
  for (let i = 0; i < 200000 && s.phase === 'descenso' && !s.ended; i++) {
    const { alt } = localFrame(s);
    if (!braking && siteDistance(s) <= brakingDistance(s) * margin) braking = true;
    if (braking) {
      if (alt > 1500) { s.assist = 'frenado'; setThrottle(s, 1); }
      else s.landingAssist = true;
    }
    stepDescent(s, braking ? 0.05 : 0.5);
  }
}

function land(): Luna {
  const s = createLuna();
  pilot(s);
  return s;
}

describe('lunar descent', () => {
  it('starts in a circular orbit that stays up without thrust', () => {
    const s = createLuna();
    const v0 = Math.hypot(s.v.x, s.v.y);
    expect(v0).toBeCloseTo(Math.sqrt(MU_MOON / (R_MOON + 20e3)), 6);
    for (let i = 0; i < 6600; i++) stepDescent(s, 1);
    expect(localFrame(s).alt).toBeGreaterThan(19e3);
    expect(s.ended).toBeNull();
    expect(predictPath(createLuna()).impact).toBeNull();
  });

  it('falls and crashes if the player burns retrograde and then cuts the engine', () => {
    const s = createLuna();
    setThrottle(s, 1);
    for (let i = 0; i < 400; i++) stepDescent(s, 0.25);
    setThrottle(s, 0);
    for (let i = 0; i < 100000 && !s.ended && s.phase === 'descenso'; i++) stepDescent(s, 0.25);
    expect(s.ended).toBe('choque');
    expect(s.touchdown!.vv).toBeGreaterThan(SAFE_VV);
  });

  it('a scripted lander reaches the surface safely near the site', () => {
    const s = land();
    expect(s.phase).toBe('superficie');
    expect(s.touchdown!.safe).toBe(true);
    expect(s.touchdown!.vv).toBeLessThanOrEqual(SAFE_VV);
    expect(s.touchdown!.dist).toBeLessThan(SITE_RADIUS);
    expect(s.prop).toBeGreaterThan(0);
    // Sin atmósfera todo el frenado sale del motor: al menos la velocidad orbital.
    expect(s.dvUsed).toBeGreaterThan(1650);
    expect(s.dvUsed).toBeLessThan(2400);
    const done = lunaObjectives(s);
    expect(done[0]).toBe(true);
    expect(done[1]).toBe(true);
  });
});

/** Juega la superficie con una estrategia: devuelve el estado final. */
function survive(s: Luna, plan: (s: Luna) => void) {
  for (let i = 0; i < 100000 && !s.ended; i++) { plan(s); stepSurface(s, 0.05); }
  return s;
}

const goodPlan = (s: Luna) => {
  if (!s.panels) lunaAction(s, 'paneles');
  const h = s.hours;
  const dark = h >= SHADOW[0] - 2 && h < SHADOW[1];
  const storm = h >= FLARE_WARN && h < FLARE[1];
  if (storm !== s.shelter) lunaAction(s, 'refugio');
  const wantDrill = !dark && !storm;
  if (wantDrill !== s.drill) lunaAction(s, 'perforar');
  const wantElectro = !dark && s.water > 0.2;
  if (wantElectro !== s.electro) lunaAction(s, 'oxigeno');
};

describe('lunar survival', () => {
  it('running out of power fails the mission', () => {
    const s = survive(land(), () => {});
    expect(s.ended).toBe('energia');
    expect(s.hours).toBeLessThan(SHADOW[0]);
    expect(lunaReport(s).resultado).toBe('fallo');
  });

  it('drilling through the shadow drains the battery', () => {
    const s = survive(land(), (x) => {
      if (!x.panels) lunaAction(x, 'paneles');
      if (!x.drill) lunaAction(x, 'perforar');
    });
    expect(s.ended).not.toBe('completada');
    expect(s.minBattery).toBe(0);
  });

  it('without ice the oxygen runs out', () => {
    const s = survive(land(), (x) => { if (!x.panels) lunaAction(x, 'paneles'); });
    expect(s.ended).toBe('oxigeno');
  });

  it('staying outside during the solar storm exceeds the dose limit', () => {
    const s = survive(land(), (x) => {
      goodPlan(x);
      if (x.shelter) lunaAction(x, 'refugio');
    });
    expect(s.ended).toBe('radiacion');
  });

  it('a careful crew completes every objective', () => {
    const s = survive(land(), goodPlan);
    expect(s.ended).toBe('completada');
    expect(s.hours).toBeGreaterThanOrEqual(SURVIVE_H);
    expect(lunaObjectives(s).every(Boolean)).toBe(true);
    const r = lunaReport(s);
    expect(r.resultado).toBe('exito');
    expect(r.sugerencias.some((x) => x.includes('Mars'))).toBe(true);
  });
});
