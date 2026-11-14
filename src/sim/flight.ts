import {
  ATM_TOP, C_LIGHT, G0, H_SCALE, KARMAN, MU, OMEGA, RE, RHO0, SITE_ANGLE0, STATION_OFFSETS, SUN_ANGLE,
} from './constants';
import { ANTENNAS, CORES, ENGINES, INSTRUMENTS, InstrumentId, MATERIALS, TANKS } from './catalog';
import {
  Design, StageDesign, cloneDesign, computeStats, dragCd, fairingMass, hasChute, hasFairing, hasShield,
  maxDiameter, payloadMass, stageDry, stageProp,
} from './vehicle';
import { CONTEXTS, ContextId, REPEAT_FACTOR, SCIENCE_VALUE, contextOf, reading } from './science';

export interface Vec { x: number; y: number }
export type Sas = 'mantener' | 'prograda' | 'retrograda';
export type EndCause = 'estructura' | 'aceleracion' | 'calor' | 'impacto' | 'aterrizaje' | 'usuario';

export interface StageState {
  design: StageDesign;
  prop: number;
  propMax: number;
  dry: number;
  thrustVac: number;
  ispSL: number;
  ispVac: number;
}

export interface Measurement {
  id: number;
  instrument: InstrumentId;
  context: ContextId;
  t: number;
  alt: number;
  reading: string;
  mb: number;
  sent: number;
  points: number;
}

export interface FlightEvent { t: number; text: string; kind: 'info' | 'ok' | 'warn' | 'bad' }

export interface Debris { r: Vec; v: Vec; angle: number; spin: number; stage: StageDesign; age: number }

export interface FlightStats {
  liftoffT: number | null;
  maxAlt: number;
  maxSpeed: number;
  maxQ: number;
  maxQAlt: number;
  maxLoad: number;
  maxG: number;
  maxFlux: number;
  gravLoss: number;
  dragLoss: number;
  dvUsed: number;
  propBurnedOnPad: number;
  orbitT: number | null;
  /** Estado en el momento de la falla, para el informe. */
  failAlt: number;
  failSpeed: number;
  failAoa: number;
  failValue: number;
  /** Velocidad y altura cuando se agotó el propelente de la última etapa. */
  burnoutSpeed: number | null;
  burnoutAlt: number;
}

export interface Flight {
  design: Design;
  t: number;
  r: Vec;
  v: Vec;
  heading: number;
  throttle: number;
  sas: Sas;
  autopilot: boolean;
  apTarget: number;
  landed: boolean;
  /** Ángulo de la posición en tierra en t = 0 (rad). */
  groundAngle0: number;
  ended: EndCause | null;
  stages: StageState[];
  /** Índice de la etapa activa. Igual a stages.length cuando solo queda la carga útil. */
  stageIdx: number;
  fairingOn: boolean;
  deployed: boolean;
  panelsLost: boolean;
  chuteOpen: boolean;
  /** Segundos desde que abrió el paracaídas: se infla de forma gradual. */
  chuteT: number;
  battery: number;
  transmitting: boolean;
  measurements: Measurement[];
  debris: Debris[];
  events: FlightEvent[];
  stats: FlightStats;
  flags: Record<string, boolean>;
  /** Valores instantáneos para la interfaz. */
  now: { q: number; load: number; g: number; flux: number; thrust: number; mass: number; sunlit: boolean; link: boolean };
  nextId: number;
}

export function createFlight(design: Design): Flight {
  const d = cloneDesign(design);
  const stages: StageState[] = d.stages.map((s) => {
    const e = ENGINES[s.engine];
    const prop = stageProp(s);
    return {
      design: s, prop, propMax: prop, dry: stageDry(s, d.material),
      thrustVac: e.thrustVac * s.engines, ispSL: e.ispSL, ispVac: e.ispVac,
    };
  });
  const st = computeStats(d);
  const f: Flight = {
    design: d,
    t: 0,
    r: { x: RE * Math.cos(SITE_ANGLE0), y: RE * Math.sin(SITE_ANGLE0) },
    v: { x: 0, y: 0 },
    heading: SITE_ANGLE0,
    throttle: 0,
    sas: 'mantener',
    autopilot: false,
    apTarget: 200e3,
    landed: true,
    groundAngle0: SITE_ANGLE0,
    ended: null,
    stages,
    stageIdx: 0,
    fairingOn: hasFairing(d),
    deployed: false,
    panelsLost: false,
    chuteOpen: false,
    chuteT: 0,
    battery: st.batteryWh,
    transmitting: false,
    measurements: [],
    debris: [],
    events: [],
    stats: {
      liftoffT: null, maxAlt: 0, maxSpeed: 0, maxQ: 0, maxQAlt: 0, maxLoad: 0, maxG: 0, maxFlux: 0,
      gravLoss: 0, dragLoss: 0, dvUsed: 0, propBurnedOnPad: 0, orbitT: null,
      failAlt: 0, failSpeed: 0, failAoa: 0, failValue: 0, burnoutSpeed: null, burnoutAlt: 0,
    },
    flags: {},
    now: { q: 0, load: 0, g: 1, flux: 0, thrust: 0, mass: st.liftoffMass, sunlit: true, link: true },
    nextId: 1,
  };
  f.v = groundVelocity(f.r);
  return f;
}

// ---------- Utilidades ----------

export function groundVelocity(r: Vec): Vec {
  // La Tierra gira en sentido horario en este plano: el este queda a la derecha en el despegue.
  return { x: OMEGA * r.y, y: -OMEGA * r.x };
}

export function altitude(f: Flight): number {
  return Math.hypot(f.r.x, f.r.y) - RE;
}

export function density(alt: number): number {
  if (alt > ATM_TOP) return 0;
  return RHO0 * Math.exp(-Math.max(alt, 0) / H_SCALE);
}

export function currentMass(f: Flight): number {
  let m = payloadMass(f.design);
  if (f.fairingOn) m += fairingMass(f.design);
  for (let i = f.stageIdx; i < f.stages.length; i++) m += f.stages[i].dry + f.stages[i].prop;
  return m;
}

export function payloadOnly(f: Flight): boolean {
  return f.stageIdx >= f.stages.length;
}

export function isSunlit(r: Vec): boolean {
  const sx = Math.cos(SUN_ANGLE), sy = Math.sin(SUN_ANGLE);
  const along = r.x * sx + r.y * sy;
  if (along > 0) return true;
  const perp = Math.abs(r.x * sy - r.y * sx);
  return perp > RE;
}

export function stationPositions(t: number): Vec[] {
  return STATION_OFFSETS.map((o) => {
    const a = SITE_ANGLE0 + o - OMEGA * t;
    return { x: RE * Math.cos(a), y: RE * Math.sin(a) };
  });
}

/** Estación visible más cercana y distancia a ella, o null si no hay línea de vista. */
export function linkStatus(f: Flight): { index: number; distance: number; delay: number } | null {
  let best: { index: number; distance: number; delay: number } | null = null;
  const stations = stationPositions(f.t);
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const dx = f.r.x - s.x, dy = f.r.y - s.y;
    // Sobre el horizonte de la estación (con 1 km de tolerancia para la plataforma).
    if (dx * s.x + dy * s.y >= -1000 * RE) {
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.distance) best = { index: i, distance: dist, delay: dist / C_LIGHT };
    }
  }
  return best;
}

export interface Orbit {
  a: number; e: number;
  /** Radios de apoapsis y periapsis (m). */
  ap: number; pe: number;
  argPe: number; period: number; p: number;
}

export function orbitOf(r: Vec, v: Vec): Orbit {
  const rm = Math.hypot(r.x, r.y);
  const v2 = v.x * v.x + v.y * v.y;
  const eps = v2 / 2 - MU / rm;
  const hz = r.x * v.y - r.y * v.x;
  const ex = (v.y * hz) / MU - r.x / rm;
  const ey = (-v.x * hz) / MU - r.y / rm;
  const e = Math.hypot(ex, ey);
  const a = -MU / (2 * eps);
  const p = (hz * hz) / MU;
  return {
    a, e, p,
    pe: p / (1 + e),
    ap: e < 1 ? p / (1 - e) : Infinity,
    argPe: Math.atan2(ey, ex),
    period: e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / MU) : Infinity,
  };
}

/** Segundos hasta el apoapsis y el periapsis. Infinity si la órbita es abierta. */
export function timeToApsides(r: Vec, v: Vec, o: Orbit): { toAp: number; toPe: number } {
  if (!(o.e < 1) || o.e < 1e-5 || !(o.a > 0)) return { toAp: Infinity, toPe: Infinity };
  const rm = Math.hypot(r.x, r.y);
  let E = Math.acos(Math.max(-1, Math.min(1, (1 - rm / o.a) / o.e)));
  if (r.x * v.x + r.y * v.y < 0) E = 2 * Math.PI - E;
  const M = E - o.e * Math.sin(E);
  const n = Math.sqrt(MU / (o.a * o.a * o.a));
  let toAp = (Math.PI - M) / n;
  if (toAp < 0) toAp += (2 * Math.PI) / n;
  return { toAp, toPe: (2 * Math.PI - M) / n };
}

function log(f: Flight, text: string, kind: FlightEvent['kind'] = 'info') {
  f.events.push({ t: f.t, text, kind });
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Ángulo del morro sobre el horizonte local (rad), positivo hacia arriba. */
export function pitchOf(f: Flight): number {
  const rm = Math.hypot(f.r.x, f.r.y);
  const s = (Math.cos(f.heading) * f.r.x + Math.sin(f.heading) * f.r.y) / rm;
  return Math.asin(Math.max(-1, Math.min(1, s)));
}

function headingForPitch(r: Vec, pitch: number): number {
  const rm = Math.hypot(r.x, r.y);
  const ux = r.x / rm, uy = r.y / rm;
  const ex = uy, ey = -ux; // este
  return Math.atan2(Math.cos(pitch) * ey + Math.sin(pitch) * uy, Math.cos(pitch) * ex + Math.sin(pitch) * ux);
}

// ---------- Acciones del jugador ----------

export function setThrottle(f: Flight, x: number) {
  f.throttle = Math.max(0, Math.min(1, x));
}

/** Barra espaciadora: enciende en la plataforma o separa la etapa activa. */
export function stageAction(f: Flight) {
  if (f.ended) return;
  if (f.landed && f.stats.liftoffT === null && f.throttle === 0 && f.stageIdx === 0) {
    f.throttle = 1;
    log(f, 'Encendido de motores.');
    return;
  }
  if (payloadOnly(f)) return;
  const st = f.stages[f.stageIdx];
  if (!f.landed) {
    const rm = Math.hypot(f.r.x, f.r.y);
    const back = 1.5;
    f.debris.push({
      r: { ...f.r },
      v: { x: f.v.x - Math.cos(f.heading) * back, y: f.v.y - Math.sin(f.heading) * back },
      angle: f.heading, spin: (Math.random() - 0.5) * 0.3, stage: st.design, age: 0,
    });
    if (st.prop > 1 && rm - RE < ATM_TOP && f.throttle > 0) {
      log(f, `Separaste la etapa ${f.stageIdx + 1} con ${Math.round(st.prop)} kg de propelente sin usar.`, 'warn');
    }
  }
  f.stageIdx += 1;
  if (payloadOnly(f)) {
    f.throttle = 0;
    f.flags.payloadFree = true;
    log(f, 'Carga útil liberada.', 'ok');
  } else {
    log(f, `Separación de etapa. Etapa ${f.stageIdx + 1} activa.`);
  }
}

export function canDeploy(f: Flight): boolean {
  return !f.deployed && !f.panelsLost && !f.fairingOn && !f.landed && f.now.q < 50 && f.now.thrust === 0;
}

export function deploy(f: Flight) {
  if (!canDeploy(f)) return;
  f.deployed = true;
  log(f, 'Paneles y antena desplegados.', 'ok');
}

export function storageUsed(f: Flight): number {
  return f.measurements.reduce((a, m) => a + (m.sent >= m.mb ? 0 : m.mb), 0);
}

/** Toma una medición. Devuelve un mensaje de error si no se puede. */
export function measure(f: Flight, inst: InstrumentId): string | null {
  if (f.ended && f.ended !== 'aterrizaje') return 'La nave ya no responde.';
  if (!f.design.instruments.includes(inst)) return 'Ese instrumento no está a bordo.';
  const spec = INSTRUMENTS[inst];
  if (f.fairingOn && inst !== 'termo') return 'La cofia cubre el instrumento. Se suelta a 110 km.';
  if (f.battery < spec.energy) return 'Batería insuficiente.';
  const core = CORES[f.design.core];
  if (storageUsed(f) + spec.mb > core.storage) return 'Almacenamiento lleno. Transmite datos para liberar espacio.';
  const alt = altitude(f);
  const ctx = contextOf(alt, f.landed);
  const repeats = f.measurements.filter((m) => m.instrument === inst && m.context === ctx).length;
  const points = SCIENCE_VALUE[inst][ctx] * REPEAT_FACTOR ** repeats;
  f.battery -= spec.energy;
  const m: Measurement = {
    id: f.nextId++, instrument: inst, context: ctx, t: f.t, alt,
    reading: reading(inst, alt, Math.hypot(f.r.x, f.r.y), f.now.sunlit),
    mb: spec.mb, sent: 0, points,
  };
  f.measurements.push(m);
  log(f, `${spec.nombre} en ${CONTEXTS[ctx].toLowerCase()}: ${m.reading}`, 'ok');
  return null;
}

/** Razón por la que no se puede transmitir ahora, o null si el enlace está listo. */
export function transmitBlocker(f: Flight): string | null {
  const ant = ANTENNAS[f.design.antenna];
  if (ant.rate <= 0) return 'La nave no lleva antena.';
  if (f.fairingOn) return 'La cofia cubre la antena.';
  if (!f.landed && !f.deployed) return 'Despliega la antena primero.';
  if (f.battery <= 0) return 'Sin batería.';
  if (!f.now.link) return 'Sin línea de vista a una estación terrestre.';
  if (!f.measurements.some((m) => m.sent < m.mb)) return 'No hay datos pendientes.';
  return null;
}

export function scienceTotals(f: Flight): { obtenida: number; entregada: number; pendientesMB: number } {
  let obtenida = 0, entregada = 0, pendientesMB = 0;
  for (const m of f.measurements) {
    obtenida += m.points;
    entregada += m.points * Math.min(1, m.sent / m.mb);
    pendientesMB += Math.max(0, m.mb - m.sent);
  }
  return { obtenida, entregada, pendientesMB };
}

export function endFlight(f: Flight, cause: EndCause) {
  if (!f.ended) f.ended = cause;
}

// ---------- Piloto automático de ascenso (nivel de asistencia "automático") ----------

function runAutopilot(f: Flight) {
  const rm = Math.hypot(f.r.x, f.r.y);
  const h = rm - RE;
  const o = orbitOf(f.r, f.v);
  const mat = MATERIALS[f.design.material];
  if (payloadOnly(f)) { f.autopilot = false; return; }
  const st = f.stages[f.stageIdx];
  if (st.prop <= 0) {
    if (f.stageIdx < f.stages.length - 1) { stageAction(f); return; }
    f.autopilot = false;
    f.throttle = 0;
    log(f, 'Piloto automático: propelente agotado antes de alcanzar la órbita.', 'warn');
    return;
  }
  if (o.pe - RE >= f.apTarget - 30e3 && h > ATM_TOP) {
    f.throttle = 0;
    f.autopilot = false;
    f.sas = 'prograda';
    log(f, 'Piloto automático: órbita alcanzada. Tienes el control.', 'ok');
    return;
  }
  if (f.landed && f.throttle === 0) { stageAction(f); return; }
  const ux = f.r.x / rm, uy = f.r.y / rm;
  const air = groundVelocity(f.r);
  const vrx = f.v.x - air.x, vry = f.v.y - air.y;
  const vr = f.v.x * ux + f.v.y * uy;
  const vh = f.v.x * uy - f.v.y * ux;
  let pitch: number;
  if (h < 1000 || Math.hypot(vrx, vry) < 60) {
    pitch = Math.PI / 2;
  } else if (h < 45e3) {
    const k = Math.min(1, (h - 1000) / 44e3);
    pitch = (Math.PI / 180) * (90 - 62 * Math.pow(k, 0.55));
  } else {
    // Guiado: llega a la altura objetivo con velocidad vertical cero justo al alcanzar
    // la velocidad orbital. Compensa la gravedad efectiva (gravedad menos efecto centrífugo).
    const m = currentMass(f);
    const thr = st.thrustVac * Math.max(f.throttle, 0.05);
    const acc = thr / m;
    const ve = st.ispVac * G0;
    const vCirc = Math.sqrt(MU / rm);
    const dvLeft = Math.max(0, vCirc - vh);
    const tGo = Math.max(12, (m * ve / thr) * (1 - Math.exp(-dvLeft / ve)));
    const gEff = MU / (rm * rm) - (vh * vh) / rm;
    const vrDes = Math.max(-150, Math.min(1300, (2 * (f.apTarget - h)) / tGo));
    const s = (gEff + (vrDes - vr) / Math.max(8, tGo * 0.25)) / acc;
    pitch = Math.asin(Math.max(-0.35, Math.min(0.9, s)));
    if (vh >= vCirc && o.ap - RE > f.apTarget + 60e3) {
      f.throttle = 0;
      f.autopilot = false;
      f.sas = 'prograda';
      log(f, 'Piloto automático: velocidad orbital alcanzada. Tienes el control.', 'ok');
      return;
    }
  }
  f.sas = 'mantener';
  const target = headingForPitch(f.r, pitch);
  f.heading = target; // el giro real lo limita stepFlight con apHeading
  f.flags.apSet = true;
  // Reduce potencia al acercarse al límite estructural, si la carga lo exige.
  if (f.flags.fullThrottle) { f.throttle = 1; return; }
  const ratio = f.now.load / mat.qLimit;
  if (ratio > 0.8) f.throttle = Math.max(0.35, f.throttle - 0.02);
  else if (ratio < 0.7) f.throttle = Math.min(1, f.throttle + 0.02);
  if (f.now.g > mat.gLimit * 0.85) f.throttle = Math.max(0.2, f.throttle - 0.03);
}

// ---------- Paso de simulación ----------

const SLEW = (20 * Math.PI) / 180; // rad/s

/**
 * Avanza la simulación dt segundos.
 * rot: giro manual solicitado, -1 (hacia el oeste) a 1 (hacia el este).
 */
export function stepFlight(f: Flight, dt: number, rot = 0) {
  if (f.ended) return;
  const d = f.design;
  const mat = MATERIALS[d.material];
  const core = CORES[d.core];

  // --- Actitud ---
  if (f.autopilot) {
    const prev = f.heading;
    runAutopilot(f);
    if (f.flags.apSet) {
      const diff = wrapAngle(f.heading - prev);
      const maxStep = SLEW * 0.5 * dt;
      f.heading = prev + Math.max(-maxStep, Math.min(maxStep, diff));
      f.flags.apSet = false;
    }
  } else if (!f.landed) {
    if (rot !== 0) {
      f.heading -= rot * SLEW * dt;
      f.sas = 'mantener';
    } else if (f.sas !== 'mantener') {
      const air = groundVelocity(f.r);
      const useSurface = altitude(f) < 45e3;
      let vx = f.v.x - (useSurface ? air.x : 0), vy = f.v.y - (useSurface ? air.y : 0);
      if (Math.hypot(vx, vy) > 5) {
        if (f.sas === 'retrograda') { vx = -vx; vy = -vy; }
        const diff = wrapAngle(Math.atan2(vy, vx) - f.heading);
        const maxStep = SLEW * dt;
        f.heading += Math.max(-maxStep, Math.min(maxStep, diff));
      }
    }
  }
  if (f.ended) return;

  let rm = Math.hypot(f.r.x, f.r.y);
  let h = rm - RE;
  const st = payloadOnly(f) ? null : f.stages[f.stageIdx];

  // --- Propulsión ---
  const pr = h > ATM_TOP ? 0 : Math.exp(-Math.max(h, 0) / H_SCALE);
  let thrust = 0;
  if (st && st.prop > 0 && f.throttle > 0) {
    let mdot = (st.thrustVac * f.throttle) / (st.ispVac * G0);
    let frac = 1;
    if (mdot * dt > st.prop) frac = st.prop / (mdot * dt);
    const isp = st.ispVac + (st.ispSL - st.ispVac) * pr;
    thrust = mdot * G0 * isp * frac;
    st.prop = Math.max(0, st.prop - mdot * dt * frac);
    if (f.landed) f.stats.propBurnedOnPad += mdot * dt * frac;
    if (st.prop <= 0) {
      log(f, `Etapa ${f.stageIdx + 1} sin propelente.`, 'warn');
      if (f.stageIdx === f.stages.length - 1 && f.stats.burnoutSpeed === null) {
        f.stats.burnoutSpeed = Math.hypot(f.v.x, f.v.y);
        f.stats.burnoutAlt = h;
      }
    }
  }
  const mass = currentMass(f);
  const g = MU / (rm * rm);
  let q = 0, load = 0, gForce = 1, flux = 0;

  if (f.landed) {
    const a = f.groundAngle0 - OMEGA * (f.t + dt);
    f.r = { x: RE * Math.cos(a), y: RE * Math.sin(a) };
    f.v = groundVelocity(f.r);
    if (f.stats.liftoffT === null) f.heading = a;
    if (thrust > mass * g && f.stats.liftoffT === null) {
      f.landed = false;
      f.stats.liftoffT = f.t;
      log(f, 'Despegue.', 'ok');
    }
  } else {
    const ux = f.r.x / rm, uy = f.r.y / rm;
    const air = groundVelocity(f.r);
    const vrx = f.v.x - air.x, vry = f.v.y - air.y;
    const speedRel = Math.hypot(vrx, vry);
    const rho = density(h);
    q = 0.5 * rho * speedRel * speedRel;
    const free = payloadOnly(f);
    let cdA: number;
    if (f.chuteOpen) {
      f.chuteT += dt;
      const k = Math.min(1, f.chuteT / 8);
      cdA = 0.7 + core.chuteCdA * k * k;
    } else {
      const dia = maxDiameter(d, f.stageIdx);
      cdA = dragCd(d, f.fairingOn) * Math.PI * (dia / 2) ** 2;
    }
    let dragX = 0, dragY = 0;
    if (speedRel > 0.01) {
      dragX = (-q * cdA * vrx) / speedRel;
      dragY = (-q * cdA * vry) / speedRel;
    }
    // Ángulo de ataque: volar de lado a alta presión dinámica multiplica la carga.
    let aoa = 0;
    if (speedRel > 30 && !free && !f.chuteOpen) {
      aoa = Math.abs(wrapAngle(Math.atan2(vry, vrx) - f.heading));
    }
    load = free || f.chuteOpen ? q : q * (1 + 3 * Math.abs(Math.sin(aoa)));
    const hx = Math.cos(f.heading), hy = Math.sin(f.heading);
    const fx = thrust * hx + dragX, fy = thrust * hy + dragY;
    gForce = Math.hypot(fx, fy) / mass / G0;
    flux = 1.83e-4 * Math.sqrt(rho) * speedRel ** 3;

    if (thrust === 0 && rho === 0) {
      // En vacío y sin empuje se usa un integrador de salto de rana, que conserva la órbita
      // aunque el paso de tiempo sea grande (aceleración temporal alta).
      f.v.x += -g * ux * dt * 0.5;
      f.v.y += -g * uy * dt * 0.5;
      f.r.x += f.v.x * dt;
      f.r.y += f.v.y * dt;
      const r2 = Math.hypot(f.r.x, f.r.y);
      const g2 = MU / (r2 * r2);
      f.v.x += -g2 * (f.r.x / r2) * dt * 0.5;
      f.v.y += -g2 * (f.r.y / r2) * dt * 0.5;
    } else {
      f.v.x += (-g * ux + fx / mass) * dt;
      f.v.y += (-g * uy + fy / mass) * dt;
      f.r.x += f.v.x * dt;
      f.r.y += f.v.y * dt;
    }

    // Estadísticas para el informe.
    const s = f.stats;
    const speed = Math.hypot(f.v.x, f.v.y);
    if (thrust > 0) {
      s.dvUsed += (thrust / mass) * dt;
      if (speed > 1) s.gravLoss += Math.max(0, (g * (f.v.x * ux + f.v.y * uy)) / speed) * dt;
    }
    s.dragLoss += (Math.hypot(dragX, dragY) / mass) * dt;
    if (q > s.maxQ) { s.maxQ = q; s.maxQAlt = h; }
    s.maxLoad = Math.max(s.maxLoad, load);
    s.maxG = Math.max(s.maxG, gForce);
    s.maxFlux = Math.max(s.maxFlux, flux);
    s.maxSpeed = Math.max(s.maxSpeed, speed);

    rm = Math.hypot(f.r.x, f.r.y);
    h = rm - RE;
    s.maxAlt = Math.max(s.maxAlt, h);

    const fail = (cause: EndCause, value: number, text: string) => {
      s.failAlt = h; s.failSpeed = speedRel; s.failAoa = aoa; s.failValue = value;
      f.ended = cause;
      f.throttle = 0;
      log(f, text, 'bad');
    };

    // --- Límites físicos ---
    const qLimit = free ? mat.qLimit * 3 : mat.qLimit;
    const gLimit = free ? 20 : mat.gLimit;
    const fluxLimit = hasShield(d) ? 2e7 : f.fairingOn ? 1.5e6 : 6e5;
    if (load > qLimit) {
      fail('estructura', load, 'La estructura se rompió por carga aerodinámica.');
    } else if (gForce > gLimit) {
      fail('aceleracion', gForce, 'La estructura no soportó la aceleración.');
    } else if (flux > fluxLimit) {
      fail('calor', flux, 'La nave se destruyó por calentamiento aerodinámico.');
    } else if (h <= 0) {
      const gv = groundVelocity(f.r);
      const impact = Math.hypot(f.v.x - gv.x, f.v.y - gv.y);
      const k = RE / rm;
      f.r.x *= k; f.r.y *= k;
      if (impact < 10) {
        f.landed = true;
        f.groundAngle0 = Math.atan2(f.r.y, f.r.x) + OMEGA * f.t;
        f.v = groundVelocity(f.r);
        f.throttle = 0;
        f.ended = 'aterrizaje';
        s.failSpeed = impact;
        log(f, `Aterrizaje a ${impact.toFixed(1)} m/s.`, 'ok');
      } else {
        fail('impacto', impact, `Impacto contra la superficie a ${Math.round(impact)} m/s.`);
      }
    }
    if (f.ended) { f.now = { q, load, g: gForce, flux, thrust, mass, sunlit: isSunlit(f.r), link: false }; f.t += dt; return; }

    // --- Eventos automáticos ---
    if (f.fairingOn && h > 110e3) {
      f.fairingOn = false;
      log(f, 'Cofia liberada a 110 km: ya no hay aire que proteger.', 'info');
    }
    if (f.deployed && q > 300) {
      f.deployed = false;
      f.panelsLost = true;
      log(f, 'El aire arrancó los paneles y la antena desplegados.', 'bad');
    }
    const vrad = f.v.x * (f.r.x / rm) + f.v.y * (f.r.y / rm);
    if (hasChute(d) && !f.chuteOpen && free && h < 7000 && vrad < 0 && speedRel < 200) {
      f.chuteOpen = true;
      log(f, 'Paracaídas desplegado.', 'ok');
    }
    if (!f.flags.karman && h > KARMAN) {
      f.flags.karman = true;
      log(f, 'Cruzaste la línea de Kármán (100 km): estás en el espacio.', 'ok');
    }
    if (h > ATM_TOP) {
      const o = orbitOf(f.r, f.v);
      if (!f.flags.orbit && o.e < 1 && o.pe - RE > ATM_TOP) {
        f.flags.orbit = true;
        s.orbitT = f.t;
        log(f, `Órbita estable: ${Math.round((o.pe - RE) / 1000)} × ${Math.round((o.ap - RE) / 1000)} km.`, 'ok');
      }
    }
  }

  // --- Energía y comunicaciones ---
  const sunlit = isSunlit(f.r);
  const link = linkStatus(f) !== null;
  const stats = f.flags.payloadFree || f.deployed || f.landed;
  let gen = 0;
  if (sunlit && !f.fairingOn) {
    gen = core.solar * (stats ? 1 : 0.3);
    if (f.deployed) gen += d.panels * 30;
  }
  let use = core.basePower;
  f.now = { q, load, g: gForce, flux, thrust, mass, sunlit, link };
  if (f.transmitting) {
    if (transmitBlocker(f) === null) {
      const ant = ANTENNAS[d.antenna];
      use += ant.power;
      let budget = ant.rate * dt;
      for (const m of f.measurements) {
        if (budget <= 0) break;
        const left = m.mb - m.sent;
        if (left <= 0) continue;
        const sent = Math.min(left, budget);
        m.sent += sent;
        budget -= sent;
        if (m.sent >= m.mb) log(f, `Datos recibidos en Tierra: ${INSTRUMENTS[m.instrument].nombre}.`, 'ok');
      }
    } else if (!f.measurements.some((m) => m.sent < m.mb)) {
      f.transmitting = false;
    }
  }
  const cap = core.battery + d.batteries * 150;
  f.battery = Math.max(0, Math.min(cap, f.battery + ((gen - use) * dt) / 3600));
  if (f.battery <= 0 && !f.flags.dead) {
    f.flags.dead = true;
    log(f, 'Batería agotada: instrumentos y antena sin energía.', 'bad');
  } else if (f.battery > 1) f.flags.dead = false;

  // --- Etapas descartadas ---
  for (const b of f.debris) {
    const br = Math.hypot(b.r.x, b.r.y);
    const bh = br - RE;
    const air = groundVelocity(b.r);
    const rx = b.v.x - air.x, ry = b.v.y - air.y;
    const sp = Math.hypot(rx, ry);
    const dia = TANKS[b.stage.tank].diameter;
    const k = (0.5 * density(bh) * sp * 1.2 * Math.PI * (dia / 2) ** 2) / Math.max(200, stageDry(b.stage, d.material));
    const bg = MU / (br * br);
    b.v.x += (-bg * (b.r.x / br) - k * rx) * dt;
    b.v.y += (-bg * (b.r.y / br) - k * ry) * dt;
    b.r.x += b.v.x * dt;
    b.r.y += b.v.y * dt;
    b.angle += b.spin * dt;
    b.age += dt;
  }
  f.debris = f.debris.filter((b) => Math.hypot(b.r.x, b.r.y) > RE && b.age < 3600);

  f.t += dt;
}

/** Aceleración temporal máxima segura en el estado actual. */
export function maxWarp(f: Flight): number {
  const h = altitude(f);
  if (f.landed && f.stats.liftoffT === null) return 1;
  if (f.now.thrust > 0 || h < 70e3) return 5;
  if (h < ATM_TOP) return 20;
  return 1000;
}

/** Paso de integración recomendado (s). */
export function recommendedDt(f: Flight): number {
  if (f.now.thrust > 0 || f.throttle > 0 || altitude(f) < ATM_TOP) return 0.02;
  return 0.5;
}

export function delaySeconds(f: Flight): number | null {
  const l = linkStatus(f);
  return l ? l.delay : null;
}

export { headingForPitch };

/** Ensayo de túnel de viento: predice la carga máxima de un ascenso a plena potencia. */
export function predictAscentLoad(design: Design): { maxLoad: number; alt: number; speed: number } {
  const f = createFlight(design);
  f.autopilot = true;
  f.flags.fullThrottle = true;
  let best = { maxLoad: 0, alt: 0, speed: 0 };
  // Se ignoran los límites: el ensayo mide la carga, no rompe la nave.
  const mat = MATERIALS[f.design.material];
  const saved = { q: mat.qLimit, g: mat.gLimit };
  try {
    (mat as { qLimit: number }).qLimit = Infinity;
    (mat as { gLimit: number }).gLimit = Infinity;
    while (f.t < 260 && !f.ended && f.autopilot && altitude(f) < 70e3) {
      stepFlight(f, 0.05);
      if (f.now.load > best.maxLoad) {
        const air = groundVelocity(f.r);
        best = { maxLoad: f.now.load, alt: altitude(f), speed: Math.hypot(f.v.x - air.x, f.v.y - air.y) };
      }
    }
  } finally {
    (mat as { qLimit: number }).qLimit = saved.q;
    (mat as { gLimit: number }).gLimit = saved.g;
  }
  return best;
}

/** Delta-v restante en vacío con las etapas que quedan. */
export function remainingDv(f: Flight): number {
  let m = currentMass(f);
  let dv = 0;
  for (let i = f.stageIdx; i < f.stages.length; i++) {
    const st = f.stages[i];
    if (st.prop > 0) dv += st.ispVac * G0 * Math.log(m / (m - st.prop));
    m -= st.prop + st.dry;
  }
  return dv;
}
