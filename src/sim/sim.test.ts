import { describe, expect, it } from 'vitest';
import { G0, MU, RE } from './constants';
import { PRESETS, cloneDesign, computeStats } from './vehicle';
import {
  Flight, altitude, createFlight, deploy, measure, orbitOf, recommendedDt, retract, scienceTotals, setThrottle,
  stageAction, stepFlight, timeToApsides,
} from './flight';
import { MISSIONS, objectivesDone } from './missions';
import { gsd, passes, targetAngle, targetInView, timeToTarget } from './ojo';

/** Coloca la carga útil sola en una órbita circular, lista para operar. */
function inOrbit(f: Flight, alt = 300e3) {
  const r = RE + alt;
  f.landed = false;
  f.stats.liftoffT = 0;
  f.stageIdx = f.stages.length;
  f.fairingOn = false;
  f.r = { x: 0, y: r };
  f.v = { x: Math.sqrt(MU / r), y: 0 };
}

function fly(f: Flight, seconds: number, until?: (f: Flight) => boolean) {
  const end = f.t + seconds;
  while (f.t < end && !f.ended) {
    stepFlight(f, recommendedDt(f));
    if (until && until(f)) break;
  }
}

describe('vehículo', () => {
  it('la ecuación del cohete da el delta-v esperado', () => {
    const s = computeStats(PRESETS.pequeno);
    const st = s.stages[1];
    expect(st.dvVac).toBeCloseTo(343 * G0 * Math.log(st.m0 / st.m1), 6);
    // Un lanzador orbital pequeño necesita unos 9,4 km/s contando pérdidas.
    expect(s.dvVacTotal).toBeGreaterThan(9400);
  });
});

describe('órbitas', () => {
  it('una órbita circular a 200 km tiene el periodo real (~88,5 min)', () => {
    const r = RE + 200e3;
    const v = Math.sqrt(MU / r);
    const o = orbitOf({ x: 0, y: r }, { x: v, y: 0 });
    expect(o.e).toBeLessThan(1e-9);
    expect(o.period / 60).toBeCloseTo(88.5, 0);
  });

  it('el integrador conserva una órbita circular durante veinte vueltas', () => {
    const f = createFlight(PRESETS.pequeno);
    const r = RE + 300e3;
    f.landed = false;
    f.stats.liftoffT = 0;
    f.stageIdx = f.stages.length;
    f.fairingOn = false;
    f.r = { x: 0, y: r };
    f.v = { x: Math.sqrt(MU / r), y: 0 };
    fly(f, 5400 * 20);
    const o = orbitOf(f.r, f.v);
    expect(Math.abs(altitude(f) - 300e3)).toBeLessThan(500);
    expect(o.e).toBeLessThan(1e-4);
  });

  it('el tiempo al apoapsis es medio periodo desde el periapsis', () => {
    const r = RE + 200e3;
    const v = Math.sqrt(MU / r) * 1.05;
    const o = orbitOf({ x: 0, y: r }, { x: v, y: 0 });
    const t = timeToApsides({ x: 0, y: r }, { x: v, y: 0 }, o);
    expect(t.toAp).toBeCloseTo(o.period / 2, 0);
  });
});

describe('vuelo', () => {
  it('un cohete con empuje menor que su peso no despega', () => {
    const d = cloneDesign(PRESETS.pequeno);
    d.stages[0].engines = 4;
    const f = createFlight(d);
    stageAction(f);
    fly(f, 20);
    expect(f.landed).toBe(true);
    expect(f.stats.liftoffT).toBeNull();
    expect(f.stats.propBurnedOnPad).toBeGreaterThan(0);
  });

  for (const key of ['pequeno', 'mediano'] as const) {
    it(`el piloto automático lleva "${key}" a órbita sin fallas`, () => {
      const f = createFlight(PRESETS[key]);
      f.autopilot = true;
      fly(f, 1500, (x) => !x.autopilot);
      const o = orbitOf(f.r, f.v);
      const s = f.stats;
      console.log(key, {
        t: Math.round(f.t), ended: f.ended, pe: Math.round((o.pe - RE) / 1000), ap: Math.round((o.ap - RE) / 1000),
        maxQ: Math.round(s.maxQ), maxLoad: Math.round(s.maxLoad), maxG: s.maxG.toFixed(1),
        grav: Math.round(s.gravLoss), drag: Math.round(s.dragLoss), dv: Math.round(s.dvUsed),
        left: f.stages.map((x) => Math.round(x.prop)),
      });
      expect(f.ended).toBeNull();
      expect(o.pe - RE).toBeGreaterThan(140e3);
    });
  }

  it('el cohete de sondeo sube al espacio, mide y vuelve con paracaídas', () => {
    const f = createFlight(PRESETS.sondeo);
    stageAction(f);
    fly(f, 400, (x) => altitude(x) > 30e3);
    expect(measure(f, 'termo')).toBeNull();
    fly(f, 2000, (x) => x.stages[0].prop <= 0);
    stageAction(f);
    fly(f, 4000);
    console.log('sondeo', { ended: f.ended, maxAlt: Math.round(f.stats.maxAlt / 1000), maxG: f.stats.maxG.toFixed(1), flux: Math.round(f.stats.maxFlux) });
    expect(f.stats.maxAlt).toBeGreaterThan(100e3);
    expect(f.ended).toBe('aterrizaje');
    // Los datos que volvieron a bordo cuentan como entregados.
    const sci = scienceTotals(f);
    expect(sci.obtenida).toBeGreaterThan(0);
    expect(sci.entregada).toBeCloseTo(sci.obtenida, 6);
  });

  it('la barra espaciadora en la plataforma nunca suelta la primera etapa', () => {
    const f = createFlight(PRESETS.pequeno);
    setThrottle(f, 0.3);
    stageAction(f);
    expect(f.stageIdx).toBe(0);
    expect(f.throttle).toBe(1);
    stageAction(f);
    expect(f.stageIdx).toBe(0);
  });
});

describe('operación', () => {
  it('los paneles se pueden recoger y volver a desplegar', () => {
    const f = createFlight(PRESETS.pequeno);
    inOrbit(f);
    stepFlight(f, 0.5);
    deploy(f);
    expect(f.deployed).toBe(true);
    retract(f);
    expect(f.deployed).toBe(false);
    deploy(f);
    expect(f.deployed).toBe(true);
  });

  it('una lectura pequeña se transmite antes que una foto grande', () => {
    const f = createFlight(PRESETS.pequeno);
    inOrbit(f);
    stepFlight(f, 0.5);
    deploy(f);
    expect(measure(f, 'camara')).toBeNull();
    expect(measure(f, 'termo')).toBeNull();
    f.transmitting = true;
    fly(f, 60);
    const [foto, lectura] = f.measurements;
    expect(lectura.sent).toBeCloseTo(lectura.mb, 6);
    expect(foto.sent).toBeLessThan(foto.mb);
  });

  it('un objetivo cumplido no se pierde si la nave deja la órbita', () => {
    const f = createFlight(PRESETS.pequeno);
    const m = MISSIONS.cubesat;
    inOrbit(f);
    stepFlight(f, 0.5);
    const i = m.objetivos.findIndex((o) => o.id === 'orbita');
    expect(objectivesDone(m, f)[i]).toBe(true);
    f.v = { x: 0, y: 0 };
    expect(m.objetivos[i].check(f)).toBe(false);
    expect(objectivesDone(m, f)[i]).toBe(true);
  });

  it('volar de lado a alta presión dinámica rompe la estructura', () => {
    const f = createFlight(PRESETS.pequeno);
    stageAction(f);
    fly(f, 200, (x) => x.now.q > 20e3);
    f.heading -= Math.PI / 2;
    fly(f, 10);
    expect(f.ended).toBe('estructura');
  });
});

describe('ojo en la tierra', () => {
  const m = MISSIONS.ojo;
  /** Carga útil en órbita circular, justo sobre el incendio. */
  function overTarget(alt: number): Flight {
    const f = createFlight(m.preset);
    inOrbit(f, alt);
    const a = targetAngle(f.t), r = RE + alt, v = Math.sqrt(MU / r);
    f.r = { x: r * Math.cos(a), y: r * Math.sin(a) };
    f.v = { x: v * Math.sin(a), y: -v * Math.cos(a) };
    stepFlight(f, 0.5);
    return f;
  }

  it('el detalle de la imagen empeora con la altura', () => {
    expect(gsd(200e3)).toBeCloseTo(12, 6);
    expect(gsd(500e3)).toBeCloseTo(30, 6);
  });

  it('una foto sobre el incendio desde 300 km sirve; desde 700 km no', () => {
    const low = overTarget(300e3);
    expect(targetInView(low.r, low.t)).toBe(true);
    expect(measure(low, 'camara')).toBeNull();
    m.onStep!(low);
    expect(passes(low).total).toBe(1);

    const high = overTarget(700e3);
    expect(measure(high, 'camara')).toBeNull();
    m.onStep!(high);
    expect(passes(high).total).toBe(0);
  });

  it('una foto lejos del incendio no cuenta', () => {
    const f = createFlight(m.preset);
    inOrbit(f, 300e3);
    stepFlight(f, 0.5);
    expect(targetInView(f.r, f.t)).toBe(false);
    expect(measure(f, 'camara')).toBeNull();
    m.onStep!(f);
    expect(passes(f).total).toBe(0);
  });

  it('la captura programada dispara sola en cada sobrevuelo y cumple el seguimiento', () => {
    const f = createFlight(m.preset);
    inOrbit(f, 300e3);
    stepFlight(f, 0.5);
    deploy(f);
    const eta = timeToTarget(f)!;
    expect(eta).toBeGreaterThan(0);
    let shots = 0;
    while (shots < 3 && f.t < 8 * 3600) {
      f.flags['ojo:armada'] = true;
      const before = f.measurements.length;
      while (f.measurements.length === before && f.t < 8 * 3600) { stepFlight(f, 0.5); m.onStep!(f); }
      if (shots === 0) expect(Math.abs(f.t - eta)).toBeLessThan(120);
      shots += 1;
      // Sale de la zona antes de volver a programar.
      for (let i = 0; i < 2400; i++) { stepFlight(f, 0.5); m.onStep!(f); }
    }
    expect(passes(f).total).toBe(3);
    const done = objectivesDone(m, f);
    expect(done[m.objetivos.findIndex((o) => o.id === 'seguimiento')]).toBe(true);
  });
});
