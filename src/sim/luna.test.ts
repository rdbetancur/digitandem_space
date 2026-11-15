import { describe, expect, it } from 'vitest';
import {
  ALT0, FLARE, FLARE_WARN, HIGH_GATE, Luna, THRUST, MU_MOON, R_MOON, SAFE_VV, SHADOW, SITE_RADIUS, SURVIVE_H,
  brakingDistance, canAssist, createLuna, describeLuna, mass, maxWarpLuna, localFrame, lunaAction, lunaObjectives, lunaReport, predictPath, setThrottle,
  siteDistance, stepDescent, stepSurface, PAD, alongTrack, hoverTime, ignitionCountdown, redesignate, rough,
} from './luna';

interface Trace { maxSink: number; vhAtAssist: number | null; altAtStop: number | null }

/**
 * Piloto de prueba, como jugaría una persona: espera, frena a pleno empuje con el asistente
 * de frenado y, debajo de 2 km, conecta el asistente de alunizaje.
 */
function pilot(s: Luna, margin = 1, dtBurn = 0.05): Trace {
  let braking = false;
  const tr: Trace = { maxSink: 0, vhAtAssist: null, altAtStop: null };
  for (let i = 0; i < 400000 && s.phase === 'descenso' && !s.ended; i++) {
    const { alt, vv, vh } = localFrame(s);
    if (!braking && siteDistance(s) <= brakingDistance(s) * margin) braking = true;
    if (braking) {
      if (canAssist(s)) {
        if (!s.landingAssist) tr.vhAtAssist = vh;
        s.landingAssist = true;
        // Como haría una persona: si el punto designado tiene rocas, lo corre hasta suelo libre.
        while (rough(s.target)) redesignate(s, 1);
      } else if (Math.abs(vh) > 3) { s.assist = 'frenado'; setThrottle(s, 1); }
      else { if (tr.altAtStop === null) tr.altAtStop = alt; setThrottle(s, 0); }
      tr.maxSink = Math.max(tr.maxSink, -vv);
    }
    stepDescent(s, braking ? dtBurn : 0.5);
  }
  return tr;
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
    expect(v0).toBeCloseTo(Math.sqrt(MU_MOON / (R_MOON + ALT0)), 6);
    for (let i = 0; i < 6600; i++) stepDescent(s, 1);
    expect(localFrame(s).alt).toBeGreaterThan(ALT0 - 1e3);
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

  it('thrust pushes along the lander attitude with a = F / m', () => {
    // Retrógrado (−90°): frena la velocidad horizontal.
    const a = createLuna();
    a.assist = 'manual'; a.pitch = -Math.PI / 2; setThrottle(a, 1);
    const vh0 = localFrame(a).vh;
    const m0 = mass(a);
    stepDescent(a, 0.1);
    expect(vh0 - localFrame(a).vh).toBeCloseTo((THRUST / m0) * 0.1, 2);
    // Vertical (0°): empuja hacia arriba; en órbita circular la gravedad está compensada.
    const b = createLuna();
    b.assist = 'manual'; b.pitch = 0; setThrottle(b, 1);
    stepDescent(b, 0.1);
    expect(localFrame(b).vv).toBeCloseTo((THRUST / m0) * 0.1, 2);
  });

  it('the result does not depend on the time step', () => {
    const a = createLuna(), b = createLuna();
    pilot(a, 1, 0.05);
    pilot(b, 1, 0.01);
    expect(a.touchdown!.safe && b.touchdown!.safe).toBe(true);
    expect(Math.abs(a.dvUsed - b.dvUsed)).toBeLessThan(5);
    expect(Math.abs(a.touchdown!.dist - b.touchdown!.dist)).toBeLessThan(200);
  });

  it('braking ends near the high gate instead of diving at 80 m/s', () => {
    // Antes el asistente dejaba caer la nave a 80 m/s y seguía con 200 m/s de horizontal a 2 km.
    const s = createLuna();
    const tr = pilot(s);
    // Real LOLA relief changes the height profile compared with the old smooth sphere.
    expect(tr.maxSink).toBeLessThan(65);
    expect(Math.abs(tr.vhAtAssist!)).toBeLessThan(80);
    // Si la horizontal se acaba antes, que sea cerca del portón alto, no a 6 km.
    if (tr.altAtStop !== null) expect(tr.altAtStop).toBeLessThan(HIGH_GATE + 1500);
    expect(s.touchdown!.safe).toBe(true);
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

describe('hazards and landing point redesignation', () => {
  it('the computer aims at a boulder field, with clear ground a few pads away', () => {
    expect(rough(0)).toBe(true);
    expect(rough(5 * PAD)).toBe(false);
    expect(rough(-4 * PAD)).toBe(false);
  });

  it('trusting the landing assist without redesignating ends on the boulders', () => {
    const s = createLuna();
    let braking = false;
    for (let i = 0; i < 400000 && s.phase === 'descenso' && !s.ended; i++) {
      if (!braking && siteDistance(s) <= brakingDistance(s)) braking = true;
      if (braking) {
        if (canAssist(s)) s.landingAssist = true;
        else if (Math.abs(localFrame(s).vh) > 3) setThrottle(s, 1);
        else setThrottle(s, 0);
      }
      stepDescent(s, braking ? 0.05 : 0.5);
    }
    expect(s.ended).toBe('choque');
    expect(s.touchdown!.rough).toBe(true);
    expect(s.touchdown!.vv).toBeLessThanOrEqual(SAFE_VV);
    expect(s.events.some((e) => e.text.includes('Redesignate'))).toBe(true);
    expect(lunaReport(s).causas.some((c) => c.includes('boulder'))).toBe(true);
  });

  it('the assist flies to the redesignated point and lands on it', () => {
    const s = land();
    expect(s.touchdown!.safe).toBe(true);
    expect(s.redesignations).toBeGreaterThan(0);
    expect(rough(alongTrack(s))).toBe(false);
    expect(Math.abs(alongTrack(s) - s.target)).toBeLessThan(PAD / 2);
  });

  it('a late redesignation costs hover propellant', () => {
    const a = land();
    const b = createLuna();
    let moved = false;
    for (let i = 0; i < 400000 && b.phase === 'descenso' && !b.ended; i++) {
      if (siteDistance(b) <= brakingDistance(b)) {
        if (canAssist(b)) {
          b.landingAssist = true;
          if (!moved && localFrame(b).alt < 40) { moved = true; while (rough(b.target)) redesignate(b, -1); }
        } else if (Math.abs(localFrame(b).vh) > 3) setThrottle(b, 1);
        else setThrottle(b, 0);
      }
      stepDescent(b, 0.05);
    }
    expect(b.touchdown!.safe).toBe(true);
    expect(b.prop).toBeLessThan(a.prop);
    expect(hoverTime(b)).toBeGreaterThan(0);
  });

  it('counts down to the ignition point while coasting', () => {
    const s = createLuna();
    const t0 = ignitionCountdown(s)!;
    expect(t0).toBeGreaterThan(60);
    expect(t0).toBeLessThan(240);
    for (let i = 0; i < 20; i++) stepDescent(s, 0.5);
    expect(ignitionCountdown(s)!).toBeCloseTo(t0 - 10, 0);
    setThrottle(s, 1);
    expect(ignitionCountdown(s)).toBeNull();
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
    const initial = land();
    initial.hours = SHADOW[0]; initial.battery = 30000; initial.o2 = 100;
    const s = survive(initial, (x) => {
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

describe('lunar review fixes', () => {
  it('with no propellant, coasting time warp is not stuck at 2x', () => {
    const s = createLuna();
    s.prop = 0;
    expect(brakingDistance(s)).toBe(Infinity);
    expect(maxWarpLuna(s)).toBe(100);
  });

  it('Mission Control gets English words, not internal ids', () => {
    const s = createLuna();
    s.assist = 'frenado';
    expect(describeLuna(s)).toContain('assist braking');
    s.prop = 0;
    expect(describeLuna(s)).toContain('no propellant left');
    s.ended = 'energia';
    const text = describeLuna(s);
    expect(text).toContain('the base lost power');
    for (const id of ['frenado', 'choque', 'energia', 'oxigeno', 'radiacion', 'completada', 'usuario', 'Infinity', '∞']) {
      expect(text).not.toContain(id);
    }
  });

  it('the lunar report carries water and oxygen in its telemetry', () => {
    const s = survive(land(), goodPlan);
    const r = lunaReport(s);
    expect(r.cifras.find((c) => c.k === 'Water extracted')!.v).not.toBe('0.0 kg');
    expect(r.cifras.find((c) => c.k === 'Oxygen produced')!.v).not.toBe('0.0 kg');
  });
});
