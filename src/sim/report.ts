import { ATM_TOP, G0, MU, RE } from './constants';
import { MATERIALS } from './catalog';
import { Flight, orbitOf, scienceTotals } from './flight';
import { Mission, objectivesDone } from './missions';
import { computeStats } from './vehicle';

export interface Report {
  titulo: string;
  resultado: 'exito' | 'parcial' | 'fallo' | 'libre';
  resumen: string;
  /** Qué ocurrió y por qué, en orden de importancia. */
  causas: string[];
  aciertos: string[];
  sugerencias: string[];
  cifras: { k: string; v: string }[];
  ciencia: { obtenida: number; entregada: number; mediciones: number };
  objetivos: { texto: string; ok: boolean }[];
  referencia: { texto: string; fuente: string; url: string } | null;
  puntaje: number;
  fecha: string;
  mision: string;
  nave: string;
}

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const km = (m: number) => `${n(m / 1000, m < 10e3 ? 1 : 0)} km`;

const REFS = {
  maxq: {
    texto: 'Dynamic pressure depends on air density and the square of speed. Real launchers throttle down as they pass through its peak ("max-Q").',
    fuente: 'NASA Glenn Research Center · Dynamic Pressure',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure/',
  },
  cohete: {
    texto: 'The rocket equation links the change in speed to the propellant mass and the engine\'s specific impulse: every extra kilogram demands more propellant.',
    fuente: 'NASA Glenn Research Center · Ideal Rocket Equation',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
  },
  twr: {
    texto: 'A rocket only lifts off if its thrust exceeds its weight. The thrust-to-weight ratio sets the initial acceleration.',
    fuente: 'NASA Glenn Research Center · Thrust to Weight Ratio',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-to-weight-ratio/',
  },
  cubesat: {
    texto: 'A CubeSat goes through the same phases as a large satellite: launch, deployment, contact and operations. All with minimal margins of mass, power and data.',
    fuente: 'NASA CubeSat Launch Initiative · CubeSat 101',
    url: 'https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf',
  },
  reentrada: {
    texto: 'On reentry, the craft turns its enormous kinetic energy into heat. Without a heat shield, that heat destroys the structure.',
    fuente: 'NASA Glenn Research Center · Rocket aerodynamics',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-aerodynamics/',
  },
};

export function buildReport(f: Flight, mission: Mission): Report {
  const d = f.design;
  const s = f.stats;
  const vs = computeStats(d);
  const mat = MATERIALS[d.material];
  const sci = scienceTotals(f);
  const done = objectivesDone(mission, f);
  const objetivos = mission.objetivos.map((o, i) => ({ texto: o.texto, ok: done[i] }));
  const allDone = objetivos.length > 0 && objetivos.every((o) => o.ok);
  const o = orbitOf(f.r, f.v);
  const inOrbit = !f.landed && o.e < 1 && o.pe - RE > ATM_TOP;
  const propLeft = f.stages.slice(f.stageIdx).reduce((a, x) => a + x.prop, 0);

  const causas: string[] = [];
  const aciertos: string[] = [];
  const sugerencias: string[] = [];
  let titulo = 'Flight ended';
  let resultado: Report['resultado'] = mission.objetivos.length ? 'parcial' : 'libre';
  let referencia: Report['referencia'] = null;
  const lostTotal = s.gravLoss + s.dragLoss;

  if (s.liftoffT === null) {
    titulo = 'The craft did not lift off';
    resultado = mission.objetivos.length ? 'fallo' : 'libre';
    const st = vs.stages[0];
    if (st && st.twr < 1) {
      causas.push(`Sea-level thrust is ${n(st.thrust / 1000)} kN and the craft weighs ${n((vs.liftoffMass * G0) / 1000)} kN: a thrust-to-weight ratio of ${n(st.twr, 2)}. Below 1, the rocket cannot lift itself.`);
      if (s.propBurnedOnPad > 0) causas.push(`You burned ${n(s.propBurnedOnPad)} kg of propellant on the pad without moving.`);
      sugerencias.push('Add engines to the first stage or cut mass until the ratio is above 1.2.');
      referencia = REFS.twr;
    } else {
      causas.push('The engines never ignited.');
    }
  } else if (f.ended === 'estructura') {
    titulo = 'Structural failure';
    resultado = 'fallo';
    const aoa = (s.failAoa * 180) / Math.PI;
    causas.push(`Aerodynamic load reached ${n(s.failValue / 1000, 1)} kPa at ${km(s.failAlt)} and ${n(s.failSpeed)} m/s. The limit for ${mat.nombre.toLowerCase()} is ${n(mat.qLimit / 1000)} kPa.`);
    if (aoa > 8) {
      causas.push(`The craft was flying ${n(aoa)}° off its direction of travel. That angle multiplied the load: nose-first it would have been ${n(s.failValue / (1 + 3 * Math.abs(Math.sin(s.failAoa))) / 1000, 1)} kPa.`);
      sugerencias.push('While the air is dense, keep the nose aligned with the trajectory (prograde mode).');
    } else {
      causas.push(`A thrust-to-weight ratio of ${n(vs.twrLiftoff, 2)} accelerated the craft too fast in dense air.`);
      sugerencias.push('Throttle down between 8 and 15 km, where dynamic pressure peaks.');
    }
    sugerencias.push('Another option is a stronger material, at the cost of more mass.');
    if (!d.tested.vibracion) sugerencias.push('You had not tested the structure: the limit was there, but you could not see it on your instruments.');
    referencia = REFS.maxq;
  } else if (f.ended === 'aceleracion') {
    titulo = 'Failure from acceleration';
    resultado = 'fallo';
    causas.push(`Acceleration reached ${n(s.failValue, 1)} g at ${km(s.failAlt)}. The structure can take ${n(mat.gLimit)} g.`);
    causas.push('As the tanks empty the craft gets much lighter, and the same thrust accelerates it harder and harder.');
    sugerencias.push('Throttle down near the end of each stage, when little propellant is left.');
    referencia = REFS.cohete;
  } else if (f.ended === 'calor') {
    titulo = 'Destroyed by heating';
    resultado = inOrbit ? 'parcial' : 'fallo';
    causas.push(`The craft entered dense air at ${n(s.failSpeed)} m/s and ${km(s.failAlt)}. The heat flux exceeded what it can take without a heat shield.`);
    sugerencias.push('To come back from orbit, the payload needs a heat shield.');
    referencia = REFS.reentrada;
  } else if (f.ended === 'impacto') {
    titulo = 'Impact with the surface';
    resultado = 'fallo';
    causas.push(`The craft hit at ${n(s.failValue)} m/s.`);
    if (s.burnoutSpeed !== null) {
      const vCirc = Math.sqrt(MU / (RE + Math.max(s.burnoutAlt, 0)));
      causas.push(`Propellant ran out at ${km(s.burnoutAlt)} and ${n(s.burnoutSpeed)} m/s. Staying in orbit at that altitude takes ${n(vCirc)} m/s: you were ${n(Math.max(0, vCirc - s.burnoutSpeed))} m/s short.`);
      causas.push(`Of the ${n(s.dvUsed)} m/s the engines delivered, ${n(s.gravLoss)} went to holding the craft up against gravity and ${n(s.dragLoss)} to pushing through the air.`);
      if (s.gravLoss > 1800) sugerencias.push('You climbed too vertically. Tilt the craft east earlier to turn thrust into horizontal speed.');
      sugerencias.push('More delta-v helps: less dry mass, more propellant or a vacuum engine on the last stage.');
      referencia = REFS.cohete;
    } else {
      sugerencias.push('To land you need a parachute, or to brake with the engine below 10 m/s.');
    }
  } else if (f.ended === 'aterrizaje') {
    titulo = 'Safe landing';
    aciertos.push(`The craft touched down at ${n(s.failSpeed, 1)} m/s.`);
    if (resultado !== 'libre') resultado = allDone ? 'exito' : 'parcial';
  }

  if (s.liftoffT !== null) {
    if (inOrbit && f.ended !== 'calor') {
      titulo = allDone ? 'Mission accomplished' : 'In orbit';
      aciertos.push(`Orbit of ${n((o.pe - RE) / 1000)} × ${n((o.ap - RE) / 1000)} km, one lap every ${n(o.period / 60, 1)} minutes.`);
      aciertos.push(`The ascent cost ${n(s.dvUsed)} m/s. Gravity and drag losses were ${n(lostTotal)} m/s (${n((lostTotal / Math.max(1, s.dvUsed)) * 100)} %).`);
      if (propLeft > 1) aciertos.push(`${n(propLeft)} kg of propellant were left in reserve for maneuvers.`);
      if (!referencia) referencia = mission.referencia ?? (mission.id === 'cubesat' ? REFS.cubesat : REFS.cohete);
    }
    if (s.maxLoad > 0 && f.ended !== 'estructura') {
      const pct = (s.maxLoad / mat.qLimit) * 100;
      if (pct > 85) sugerencias.push(`Aerodynamic load reached ${n(pct)} % of the structural limit. You came close to breaking the craft.`);
      else if (s.maxAlt > 30e3) aciertos.push(`Peak aerodynamic load was ${n(s.maxLoad / 1000, 1)} kPa at ${km(s.maxQAlt)}: ${n(pct)} % of the limit.`);
    }
  }
  if (allDone) resultado = 'exito';

  // Objetivos no cumplidos: explica el primero que faltó.
  if (!allDone && mission.objetivos.length && resultado !== 'fallo') {
    const i = done.indexOf(false);
    if (i >= 0) sugerencias.push(`Next objective: ${mission.objetivos[i].texto.toLowerCase()}. ${mission.objetivos[i].ayuda}`);
  }
  if (sci.obtenida > 0 && sci.entregada < sci.obtenida * 0.99) {
    sugerencias.push(`${n(sci.pendientesMB, 1)} MB of data were left on board, not transmitted. Science only counts in full once it reaches Earth.`);
  }
  if (f.flags.dead) causas.push('The battery hit zero: the instruments and antenna stopped working.');
  if (f.panelsLost) causas.push('The panels and antenna were torn off when they entered the air deployed.');

  const cifras = [
    { k: 'Maximum altitude', v: km(s.maxAlt) },
    { k: 'Maximum speed', v: `${n(s.maxSpeed)} m/s` },
    { k: 'Mission time', v: `${n(f.t / 60, 1)} min` },
    { k: 'Delta-v used', v: `${n(s.dvUsed)} m/s` },
    { k: 'Gravity loss', v: `${n(s.gravLoss)} m/s` },
    { k: 'Drag loss', v: `${n(s.dragLoss)} m/s` },
    { k: 'Maximum dynamic pressure', v: `${n(s.maxQ / 1000, 1)} kPa` },
    { k: 'Maximum acceleration', v: `${n(s.maxG, 1)} g` },
    { k: 'Liftoff mass', v: `${n(vs.liftoffMass)} kg` },
    { k: 'Vehicle cost', v: `${n(vs.cost, 1)} M USD` },
  ];

  let puntaje = sci.entregada * 10 + sci.obtenida * 3;
  if (mission.objetivos.length) puntaje += done.filter(Boolean).length * 100;
  if (allDone) puntaje += 200 + Math.max(0, 600 - (s.doneT ?? f.t) / 6) + (mission.presupuesto ? Math.max(0, (mission.presupuesto - vs.cost) * 20) : 0);

  const resumen = allDone
    ? 'You completed every objective. These were the decisions that made it possible.'
    : resultado === 'fallo'
      ? 'The mission was not completed. This is what happened, according to the telemetry.'
      : resultado === 'libre'
        ? 'Free flight saved to the logbook.'
        : 'You made progress, but some objectives are still open.';

  return {
    titulo, resultado, resumen, causas, aciertos, sugerencias, cifras,
    ciencia: { obtenida: sci.obtenida, entregada: sci.entregada, mediciones: f.measurements.length },
    objetivos, referencia,
    puntaje: Math.round(puntaje),
    fecha: new Date().toISOString(),
    mision: mission.nombre,
    nave: d.nombre,
  };
}
