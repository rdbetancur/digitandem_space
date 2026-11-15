// Misión "Hielo en la sombra": alunizaje propulsado en el polo sur de la Luna y diez días
// de supervivencia junto a un cráter con hielo de agua. Simulación propia y liviana: no usa
// el vuelo terrestre de flight.ts. Valores y fuentes en docs/FUENTES.md.

import { G0 } from './constants';
import type { Mission } from './missions';
import type { Report } from './report';
import { PRESETS, cloneDesign } from './vehicle';
import { terrainRadius, terrainSlope } from './lunarTerrain';
import { lunarEnvironment, LUNAR_SHADOWS } from './lunarEnvironment';

// --- Constantes de la Luna (NASA Moon Fact Sheet y JPL) ---

/** Parámetro gravitacional de la Luna (m³/s²), efemérides JPL DE440. */
export const MU_MOON = 4.902800118e12;
/** Radio medio de la Luna (m). */
export const R_MOON = 1737.4e3;
/** Gravedad en la superficie (m/s²). */
export const G_MOON = 1.62;

// --- Módulo de descenso (valores de juego, orden de magnitud de un módulo lunar pequeño) ---

export const DRY_MASS = 2600;
export const PROP0 = 3400;
export const THRUST = 24000;
/** Impulso específico de un motor hipergólico de descenso (s). */
export const ISP = 311;
/** Velocidad máxima de giro de la nave (rad/s). */
const TURN_RATE = (45 * Math.PI) / 180;

/** Altura de la órbita inicial (m): donde Apollo empezaba el descenso propulsado. Órbita polar circular. */
export const ALT0 = 15e3;
/** El sitio de alunizaje está 40° adelante en la órbita. */
export const SITE_ANGLE = (40 * Math.PI) / 180;
/** La partida empieza con el sitio 17° adelante: unos dos minutos de órbita antes del encendido. */
export const START_ANGLE = (23 * Math.PI) / 180;
/** Ancho de cada parcela del mapa de peligros del radar (m). Escenario de juego. */
export const PAD = 30;
/** Límites de un contacto seguro. */
export const SAFE_VV = 3;
export const SAFE_VH = 2;
export const SAFE_TILT = (15 * Math.PI) / 180;
/** Distancia máxima al sitio para contar como "en el blanco" (m). */
export const SITE_RADIUS = 5e3;

// --- Superficie (horas) ---

export const BATT_MAX = 30000; // Wh
export const PANEL_W = 8000;
export const BASE_W = 1200; // soporte vital, comunicaciones y computadoras
export const HEATER_W = 800; // calefacción extra sin Sol
export const DRILL_W = 2500;
export const ELECTRO_W = 3000;
/** Agua obtenida por hora de perforación (kg/h). */
export const DRILL_RATE = 1;
/** Agua que procesa el electrolizador por hora (kg/h): 3 kWh por 0,5 kg, unos 6 kWh/kg. */
export const ELECTRO_RATE = 0.5;
/** Masa de oxígeno en cada kilogramo de agua (16 / 18,015). */
export const O2_PER_WATER = 0.888;
/** Consumo de oxígeno de dos tripulantes (0,84 kg por persona y día). */
export const O2_USE = (2 * 0.84) / 24;
export const O2_0 = 5;
/** Fracción de hielo en el regolito del cráter, según LCROSS (5,6 %). */
export const ICE_FRACTION = 0.056;
/** Sombra de una cresta que tapa el Sol (horas desde el alunizaje). */
export const SHADOW: [number, number] = LUNAR_SHADOWS[0] ?? [Infinity, Infinity];
export const SHADOW_WARN = 6;
/** Tormenta solar: aviso, inicio y fin (horas). */
export const FLARE_WARN = 150;
export const FLARE: [number, number] = [152, 160];
/** Dosis de fondo en la superficie: 1,37 mSv por día (Chang'e 4). */
export const DOSE_BG = 1.369 / 24;
/** Dosis durante la tormenta fuera del refugio (mSv/h). Valor de juego. */
export const DOSE_FLARE = 40;
export const SHELTER_FACTOR = 0.1;
/** Límite de dosis de la tripulación en 30 días (NASA-STD-3001): 250 mSv. */
export const DOSE_LIMIT = 250;
export const SURVIVE_H = 240;
export const ICE_GOAL = 10;
export const CABIN_T = 21;
export const COLD_LIMIT = 5;

export type Assist = 'manual' | 'frenado' | 'vertical';
export type LunaEnd = 'choque' | 'energia' | 'oxigeno' | 'radiacion' | 'completada' | 'usuario';

export interface LunaEvent { t: number; text: string; kind: 'info' | 'ok' | 'warn' | 'bad' }

export interface Touchdown { vv: number; vh: number; tilt: number; dist: number; t: number; prop: number; safe: boolean; rough?: boolean }

export interface Luna {
  phase: 'descenso' | 'superficie';
  /** Segundos de descenso. */
  t: number;
  r: { x: number; y: number };
  v: { x: number; y: number };
  prop: number;
  throttle: number;
  /** Dirección del empuje respecto de la vertical local (rad); positivo hacia adelante. */
  pitch: number;
  assist: Assist;
  /** Asistente de alunizaje: regula el empuje para bajar despacio. */
  landingAssist: boolean;
  usedAssist: boolean;
  /** Punto de alunizaje designado: metros más allá del sitio, a lo largo de la órbita. */
  target: number;
  /** Veces que el jugador cambió el punto de alunizaje. */
  redesignations: number;
  dvUsed: number;
  maxSpeedDown: number;
  touchdown: Touchdown | null;
  ended: LunaEnd | null;
  /** Horas desde el alunizaje. */
  hours: number;
  battery: number;
  o2: number;
  water: number;
  waterTotal: number;
  o2Made: number;
  temp: number;
  dose: number;
  flareDose: number;
  panels: boolean;
  drill: boolean;
  electro: boolean;
  shelter: boolean;
  minBattery: number;
  events: LunaEvent[];
  flags: Record<string, boolean>;
}

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createLuna(): Luna {
  const r0 = R_MOON + ALT0;
  const v0 = Math.sqrt(MU_MOON / r0);
  return {
    phase: 'descenso', t: 0,
    r: { x: r0 * Math.cos(START_ANGLE), y: r0 * Math.sin(START_ANGLE) },
    v: { x: -v0 * Math.sin(START_ANGLE), y: v0 * Math.cos(START_ANGLE) },
    prop: PROP0, throttle: 0, pitch: -Math.PI / 2, assist: 'frenado', landingAssist: false, usedAssist: false,
    target: 0, redesignations: 0,
    dvUsed: 0, maxSpeedDown: 0, touchdown: null, ended: null,
    hours: 0, battery: 20000, o2: O2_0, water: 0, waterTotal: 0, o2Made: 0, temp: CABIN_T, dose: 0, flareDose: 0,
    panels: false, drill: false, electro: false, shelter: false, minBattery: 20000,
    events: [{ t: 0, text: `Polar orbit at 15 km above the mean lunar radius. Target: 89°S, 0°E, ${n(((SITE_ANGLE - START_ANGLE) * R_MOON) / 1000)} km ahead. Radar height and contact use NASA LOLA terrain. This is a simulated expedition, not a surveyed landing zone.`, kind: 'info' }],
    flags: {},
  };
}

function log(s: Luna, text: string, kind: LunaEvent['kind'] = 'info') {
  s.events.push({ t: s.phase === 'descenso' ? s.t : s.t + s.hours * 3600, text, kind });
}

// --- Descenso ---

/** Marco local: arriba, adelante (sentido de la órbita), y velocidades en ese marco. */
export function localFrame(s: Pick<Luna, 'r' | 'v'>) {
  const rm = Math.hypot(s.r.x, s.r.y);
  const up = { x: s.r.x / rm, y: s.r.y / rm };
  const fwd = { x: -up.y, y: up.x };
  return { rm, up, fwd, alt: rm - terrainRadius(Math.atan2(s.r.y, s.r.x)), vv: s.v.x * up.x + s.v.y * up.y, vh: s.v.x * fwd.x + s.v.y * fwd.y };
}

export const mass = (s: Luna) => DRY_MASS + s.prop;
export const dvLeft = (s: Luna) => ISP * G0 * Math.log(mass(s) / DRY_MASS);
export const maxAccel = (s: Luna) => (s.prop > 0 ? THRUST / mass(s) : 0);

/** Distancia por la superficie hasta el sitio (m); positiva si el sitio está adelante. */
export function siteDistance(s: Pick<Luna, 'r'>): number {
  return wrap(SITE_ANGLE - Math.atan2(s.r.y, s.r.x)) * R_MOON;
}

/**
 * Distancia por la superficie que recorre la nave hasta frenar su velocidad horizontal a
 * pleno empuje (m). Usa la ecuación del cohete: la nave se aligera y frena cada vez más fuerte.
 */
export function brakingDistance(s: Luna): number {
  const { vh, rm } = localFrame(s);
  const v = Math.abs(vh);
  const ve = ISP * G0;
  const m0 = mass(s);
  const mdot = THRUST / ve;
  const m1 = m0 * Math.exp(-v / ve);
  if (s.prop <= 0 || m1 < DRY_MASS) return Infinity;
  const T = (m0 - m1) / mdot;
  const mlnm = (m: number) => m * Math.log(m) - m;
  const lost = T * Math.log(m0) - (mlnm(m0) - mlnm(m1)) / mdot;
  // Parte del empuje se va en sostener la caída: el frenado real es algo más largo.
  return (v * T - ve * lost) * 1.015 * (R_MOON / rm);
}

/** Trayectoria balística si se apaga el motor: puntos para dibujar y punto de impacto. */
export function predictPath(s: Luna, maxT = 7000): { points: { x: number; y: number }[]; impact: number | null; impactT: number } {
  let r = { ...s.r }, v = { ...s.v }, t = 0;
  const points = [{ ...r }];
  let last = 0;
  while (t < maxT) {
    const rm = Math.hypot(r.x, r.y);
    const alt = rm - terrainRadius(Math.atan2(r.y, r.x));
    if (alt <= 0) return { points: [...points, { ...r }], impact: Math.atan2(r.y, r.x), impactT: t };
    const dt = Math.max(0.1, Math.min(4, alt / 300));
    const g = MU_MOON / (rm * rm * rm);
    v = { x: v.x - g * r.x * dt, y: v.y - g * r.y * dt };
    r = { x: r.x + v.x * dt, y: r.y + v.y * dt };
    t += dt;
    if (t - last > 15) { points.push({ ...r }); last = t; }
  }
  return { points, impact: null, impactT: Infinity };
}

// --- Peligros y punto de alunizaje designado (escenario de juego, inspirado en Apollo 11) ---

const cellHash = (i: number) => { const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };

/**
 * ¿Hay rocas en el punto u (metros más allá del sitio)? El punto apuntado por la computadora
 * cae en un campo de rocas, como le pasó a Apollo 11: hay que elegir otro lugar.
 */
export function rough(u: number): boolean {
  const i = Math.round(u / PAD);
  if (Math.abs(i) <= 2) return true;
  if (i === 5 || i === -4) return false;
  return cellHash(i) < 0.38;
}

/** Posición de la nave a lo largo de la órbita, en metros más allá del sitio. */
export const alongTrack = (s: Pick<Luna, 'r'>) => -siteDistance(s);
/** Distancia por la superficie hasta el punto designado (m); positiva si está adelante. */
export const targetDistance = (s: Pick<Luna, 'r' | 'target'>) => siteDistance(s) + s.target;

/** Mueve el punto de alunizaje designado una parcela hacia adelante (+) o hacia atrás (−). */
export function redesignate(s: Luna, steps: number) {
  if (s.phase !== 'descenso' || s.ended) return;
  s.target = (Math.round(s.target / PAD) + steps) * PAD;
  s.redesignations++;
}

/** Segundos que la nave puede sostenerse en el aire con el propelente que queda. */
export const hoverTime = (s: Luna) => dvLeft(s) / G_MOON;

/** Segundos hasta el punto de encendido a pleno empuje; null si el motor ya está encendido. */
export function ignitionCountdown(s: Luna): number | null {
  const { vh } = localFrame(s);
  const b = brakingDistance(s);
  if (s.throttle > 0 || vh < 100 || !isFinite(b)) return null;
  return (siteDistance(s) - b) / vh;
}

/** Altura a la que el frenado debería terminar: el "portón alto" de los alunizajes Apollo (m). */
export const HIGH_GATE = 1500;

/**
 * Guiado: reparte el empuje entre llevar la velocidad vertical a target (m/s, negativa hacia
 * abajo) y anular la velocidad horizontal. accel es la aceleración disponible.
 */
function guidance(s: Luna, accel: number, target: number, gain: number, vhTarget = 0) {
  const { vv, vh, alt, rm } = localFrame(s);
  // Gravedad menos el "alivio" centrífugo de la velocidad horizontal.
  const gEff = MU_MOON / (rm * rm) - (vh * vh) / rm;
  const av = Math.max(0, Math.min(accel, gEff + gain * (target - vv)));
  const room = Math.sqrt(Math.max(0, accel * accel - av * av));
  const ah = Math.max(-room, Math.min(room, (vhTarget - vh) * 0.6));
  let pitch = Math.atan2(ah, av);
  // Cerca del suelo las patas tienen que quedar casi verticales.
  const lim = alt < 60 ? 0.17 : Math.PI / 2;
  pitch = Math.max(-lim, Math.min(lim, pitch));
  return { pitch, accel: Math.hypot(av, ah) };
}

/** Asistente de alunizaje: baja a una velocidad segura según la altura y anula la deriva. */
function landingCommand(s: Luna): { pitch: number; throttle: number } {
  const amax = Math.max(1e-6, maxAccel(s));
  const { alt } = localFrame(s);
  // Vuela hacia el punto designado: baja con decisión cuando está encima y, si no, se queda
  // a unos 90 m mientras se traslada. Sostenerse en el aire cuesta propelente.
  const dx = targetDistance(s);
  const over = Math.abs(dx) < 6 + alt * 0.2;
  const base = Math.max(1.2, Math.min(25, alt / 10));
  const sink = over ? base : Math.min(base, Math.max(0, (alt - 90) / 10));
  const vmax = Math.max(2, Math.min(45, alt * 0.12));
  const g = guidance(s, amax, -sink, 1.2, Math.max(-vmax, Math.min(vmax, dx * 0.15)));
  return { pitch: g.pitch, throttle: Math.min(1, g.accel / amax) };
}

/** Ángulo de empuje que pide el asistente activo. */
function assistTarget(s: Luna): number | null {
  if (s.landingAssist) return landingCommand(s).pitch;
  if (s.assist === 'vertical') return 0;
  if (s.assist === 'frenado') {
    const a = maxAccel(s) * s.throttle;
    const { vv, vh, alt } = localFrame(s);
    // Con el motor apagado apunta en contra de la velocidad, listo para encender.
    if (a <= 0) return Math.hypot(vv, vh) > 0.5 ? Math.atan2(-vh, -vv) : 0;
    // Baja justo lo necesario para llegar al portón alto cuando la velocidad horizontal se acaba.
    // Tiempo de frenado con la ecuación del cohete: la nave se aligera mientras frena.
    const ve = ISP * G0;
    const tGo = Math.max(5, ((mass(s) * ve) / (THRUST * s.throttle)) * (1 - Math.exp(-Math.abs(vh) / ve)) / 0.95);
    const sink = Math.max(2, Math.min(60, (alt - HIGH_GATE) / tGo));
    return guidance(s, a, -sink, 0.15).pitch;
  }
  return null;
}

/** El asistente de alunizaje solo se conecta cerca del suelo, cuando el radar ve la superficie. */
export const ASSIST_ALT = 2000;
export const canAssist = (s: Luna) => s.phase === 'descenso' && !s.ended && localFrame(s).alt < ASSIST_ALT;

export function setThrottle(s: Luna, x: number) { s.throttle = Math.max(0, Math.min(1, x)); }

export function maxWarpLuna(s: Luna): number {
  if (s.phase !== 'descenso') return 1;
  const { alt } = localFrame(s);
  if (alt < 1000) return 1;
  if (alt < 3000) return 2;
  if (s.throttle > 0) return 5;
  // Cerca del punto de frenado el reloj se frena solo, para no pasarse del sitio.
  const d = siteDistance(s);
  const b = brakingDistance(s);
  // Sin propelente para frenar no hay punto de frenado que cuidar.
  if (!isFinite(b)) return 100;
  if (d > 0 && d < b + 20e3) return 2;
  if (d > 0 && d < b + 150e3) return 10;
  return 100;
}

/** Un paso de descenso. turn: −1 a 1, giro manual. */
export function stepDescent(s: Luna, dt: number, turn = 0) {
  if (s.ended || s.phase !== 'descenso') return;
  if (turn !== 0) { s.assist = 'manual'; s.pitch = wrap(s.pitch + turn * TURN_RATE * dt); }
  else {
    const target = assistTarget(s);
    if (target !== null) {
      const d = wrap(target - s.pitch);
      s.pitch = wrap(s.pitch + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, d)));
    }
  }
  if (s.landingAssist && !canAssist(s)) s.landingAssist = false;
  const fr = localFrame(s);
  if (s.landingAssist && !s.flags.lpd) {
    // Al conectar el asistente la computadora apunta al sitio; si quedó lejos, baja donde está.
    s.flags.lpd = true;
    const d = siteDistance(s);
    if (Math.abs(d) > SITE_RADIUS) s.target = Math.round((-d + (fr.vh * Math.abs(fr.vh)) / 4) / PAD) * PAD;
    if (rough(s.target)) log(s, 'Program alert: the computer is aiming at a boulder field. Redesignate the landing point with ← →.', 'warn');
  }
  if (s.landingAssist) { s.throttle = landingCommand(s).throttle; s.usedAssist = true; }
  callouts(s, fr.alt);
  const m = mass(s);
  let thrust = s.prop > 0 ? THRUST * s.throttle : 0;
  const burn = (thrust / (ISP * G0)) * dt;
  if (burn > s.prop) { thrust *= s.prop / burn; s.prop = 0; log(s, 'Propellant exhausted. The engine shut down.', 'bad'); }
  else s.prop -= burn;
  const a = thrust / m;
  s.dvUsed += a * dt;
  const dir = { x: fr.up.x * Math.cos(s.pitch) + fr.fwd.x * Math.sin(s.pitch), y: fr.up.y * Math.cos(s.pitch) + fr.fwd.y * Math.sin(s.pitch) };
  const g = MU_MOON / (fr.rm * fr.rm * fr.rm);
  s.v.x += (a * dir.x - g * s.r.x) * dt;
  s.v.y += (a * dir.y - g * s.r.y) * dt;
  s.r.x += s.v.x * dt;
  s.r.y += s.v.y * dt;
  s.t += dt;
  s.maxSpeedDown = Math.max(s.maxSpeedDown, -fr.vv);
  const after = localFrame(s);
  if (after.alt <= 0) touchDown(s, after.vv, after.vh);
}

/** Avisos de la sala de control durante el descenso, una sola vez cada uno. */
function callouts(s: Luna, alt: number) {
  const once = (k: string, ok: boolean, text: string, kind: LunaEvent['kind'] = 'info') => {
    if (ok && !s.flags[k]) { s.flags[k] = true; log(s, text, kind); }
  };
  const burning = s.throttle > 0 && s.prop > 0;
  once('pdi', burning, 'Ignition. Powered descent has started: the engine is the only brake.');
  once('highGate', burning && alt < HIGH_GATE + 500, 'High gate. The surface is coming into view.');
  once('radar', alt < ASSIST_ALT, 'Landing radar locked. Hazard scan online: green ground is clear, red is boulders. Press L for the landing assist.');
  once('lowGate', !!s.flags.pdi && alt < 150, 'Low gate. Pick your spot.');
  const hover = hoverTime(s);
  once('fuel60', !!s.flags.radar && hover < 60 && s.prop > 0, '60 seconds of hover propellant left.', 'warn');
  once('fuel30', !!s.flags.radar && hover < 30 && s.prop > 0, '30 seconds! Land now.', 'bad');
}

function touchDown(s: Luna, vv: number, vh: number) {
  const theta = Math.atan2(s.r.y, s.r.x);
  const k = terrainRadius(theta) / Math.hypot(s.r.x, s.r.y);
  s.r = { x: s.r.x * k, y: s.r.y * k };
  const slope = terrainSlope(theta);
  const tilt = Math.abs(wrap(s.pitch + slope));
  const normalV = vv * Math.cos(slope) - vh * Math.sin(slope);
  vh = vv * Math.sin(slope) + vh * Math.cos(slope);
  vv = normalV;
  const dist = Math.abs(siteDistance(s));
  const gentle = -vv <= SAFE_VV && Math.abs(vh) <= SAFE_VH && tilt <= SAFE_TILT;
  const rocks = rough(alongTrack(s));
  const safe = gentle && !rocks;
  s.touchdown = { vv: -vv, vh: Math.abs(vh), tilt, dist, t: s.t, prop: s.prop, safe, rough: rocks };
  s.v = { x: 0, y: 0 };
  s.throttle = 0;
  s.landingAssist = false;
  if (!safe) {
    s.ended = 'choque';
    if (gentle) { log(s, 'Crash: a footpad came down on a boulder and the lander tipped over.', 'bad'); return; }
    const why = -vv > SAFE_VV ? `falling at ${n(-vv, 1)} m/s` : Math.abs(vh) > SAFE_VH ? `sliding sideways at ${n(Math.abs(vh), 1)} m/s` : `tilted ${n((tilt * 180) / Math.PI)}°`;
    log(s, `Crash: the lander hit the surface ${why}.`, 'bad');
    return;
  }
  s.phase = 'superficie';
  log(s, `Contact light. Engine stop. Touchdown at ${n(-vv, 1)} m/s, ${dist < 1000 ? `${n(dist)} m` : `${n(dist / 1000, 1)} km`} from the site.`, 'ok');
  if (dist <= SITE_RADIUS) log(s, 'You reached the target region. Solar availability follows the LOLA horizon model; ice extraction is a mission scenario.', 'info');
  else log(s, 'You landed away from the site. The rover will take longer to reach the ice.', 'warn');
}

// --- Superficie ---

export const sunlit = (h: number) => lunarEnvironment(h).lit;
export const flareActive = (h: number) => h >= FLARE[0] && h < FLARE[1];

/** Perforación: más lenta si la nave quedó lejos del cráter. */
const drillRate = (s: Luna) => DRILL_RATE * (s.touchdown && s.touchdown.dist <= SITE_RADIUS ? 1 : 0.5);

export function powerBalance(s: Luna) {
  const gen = s.panels ? PANEL_W * lunarEnvironment(s.hours).panelFactor : 0;
  const load = BASE_W + (sunlit(s.hours) ? 0 : HEATER_W) + (s.drill ? DRILL_W : 0) + (s.electro ? ELECTRO_W : 0);
  return { gen, load, net: gen - load };
}

/** Horas de oxígeno que quedan al consumo actual. */
export const o2Hours = (s: Luna) => s.o2 / O2_USE;

export type LunaAction = 'paneles' | 'perforar' | 'oxigeno' | 'refugio';

/** Acciones del jugador en la superficie. Devuelve un aviso o null. */
export function lunaAction(s: Luna, a: LunaAction): string | null {
  if (s.phase !== 'superficie' || s.ended) return 'Only available on the surface.';
  if (a === 'paneles') {
    s.panels = !s.panels;
    log(s, s.panels ? 'Solar panels deployed. At the pole the Sun skims the horizon, so the panels stand vertical.' : 'Solar panels stowed.');
  } else if (a === 'perforar') {
    if (!s.drill && s.shelter) return 'The crew is in the shelter: the drill cannot run.';
    s.drill = !s.drill;
    if (s.drill) log(s, `Simulated ice deposit: ${n(ICE_FRACTION * 100, 1)} % by mass, based on LCROSS at Cabeus, not a measurement at this target.`);
  } else if (a === 'oxigeno') {
    if (!s.electro && s.water <= 0) return 'There is no water to split yet. Drill for ice first.';
    s.electro = !s.electro;
    if (s.electro) log(s, 'Electrolyzer on: splitting water into oxygen and hydrogen.');
  } else if (a === 'refugio') {
    s.shelter = !s.shelter;
    if (s.shelter && s.drill) { s.drill = false; log(s, 'Drill stopped: the crew moved into the shelter.'); }
    log(s, s.shelter ? 'Crew in the shelter, behind water tanks and regolith bags.' : 'Crew out of the shelter.');
  }
  return null;
}

/** Un paso en la superficie (horas). */
export function stepSurface(s: Luna, dtH: number) {
  if (s.ended || s.phase !== 'superficie') return;
  const h0 = s.hours;
  const h1 = h0 + dtH;
  const crossed = (x: number) => h0 < x && h1 >= x;
  for (const [start, end] of LUNAR_SHADOWS) {
    if (crossed(start - SHADOW_WARN)) log(s, `Terrain-horizon forecast: shadow in ${SHADOW_WARN} h, lasting about ${n(end - start, 1)} h.`, 'warn');
    if (crossed(start)) log(s, 'The Sun is hidden. The panels produce nothing and the heaters switch on.', 'warn');
    if (crossed(end)) log(s, 'Sunlight is back on the panels.', 'ok');
  }
  if (crossed(FLARE_WARN)) log(s, `Scenario alert: energetic solar particles arrive in ${FLARE[0] - FLARE_WARN} h. The Moon has no substantial atmosphere or global magnetic shield.`, 'warn');
  if (crossed(FLARE[0])) log(s, 'The proton storm has started.', s.shelter ? 'info' : 'bad');
  if (crossed(FLARE[1])) log(s, 'The solar storm has passed.', 'ok');

  // Energía
  let { gen, load } = powerBalance(s);
  let e = s.battery + (gen - load) * dtH;
  if (e <= 0 && (s.drill || s.electro)) {
    s.drill = false; s.electro = false;
    log(s, 'Battery empty: the drill and the electrolyzer shut down to protect life support.', 'bad');
    ({ gen, load } = powerBalance(s));
    e = s.battery + (gen - load) * dtH;
  }
  const powered = e > 0;
  s.battery = Math.max(0, Math.min(BATT_MAX, e));
  s.minBattery = Math.min(s.minBattery, s.battery);

  // Calor: sin energía la cabina se enfría, más rápido sin Sol.
  if (powered) s.temp = Math.min(CABIN_T, s.temp + 4 * dtH);
  else {
    if (!s.flags.sinEnergia) { s.flags.sinEnergia = true; log(s, 'No power: life support and heaters are off. The cabin is cooling down.', 'bad'); }
    const groundK = lunarEnvironment(h1).groundTemperatureC + 273.15;
    const cabinK = s.temp + 273.15;
    s.temp -= 6 * Math.max(0, (cabinK ** 4 - groundK ** 4) / (294.15 ** 4 - 100 ** 4)) * dtH;
  }
  if (powered) s.flags.sinEnergia = false;

  // Hielo y oxígeno
  if (powered && s.drill) { const w = drillRate(s) * dtH; s.water += w; s.waterTotal += w; }
  if (powered && s.electro) {
    const w = Math.min(s.water, ELECTRO_RATE * dtH);
    s.water -= w;
    s.o2 += w * O2_PER_WATER;
    s.o2Made += w * O2_PER_WATER;
    if (s.water <= 1e-9) { s.electro = false; log(s, 'The electrolyzer ran out of water.'); }
  }
  s.o2 = Math.max(0, s.o2 - O2_USE * dtH);

  // Radiación
  const flare = flareActive(h0);
  const rate = DOSE_BG + (flare ? DOSE_FLARE : 0);
  const d = rate * (s.shelter ? SHELTER_FACTOR : 1) * dtH;
  s.dose += d;
  if (flare) s.flareDose += d;

  s.hours = h1;
  if (!s.flags.hielo && s.waterTotal >= ICE_GOAL) { s.flags.hielo = true; log(s, `${ICE_GOAL} kg of water extracted from the shadowed crater.`, 'ok'); }

  if (s.temp < COLD_LIMIT) { s.ended = 'energia'; log(s, 'The cabin froze: without power there is no life support.', 'bad'); }
  else if (s.o2 <= 0) { s.ended = 'oxigeno'; log(s, 'Oxygen ran out.', 'bad'); }
  else if (s.dose > DOSE_LIMIT) { s.ended = 'radiacion'; log(s, `The crew received ${n(s.dose)} mSv, over the ${DOSE_LIMIT} mSv limit. Mission aborted.`, 'bad'); }
  else if (s.hours >= SURVIVE_H) { s.ended = 'completada'; log(s, 'Ten days on the Moon. The crew is safe and the base keeps working.', 'ok'); }
}

export function endLuna(s: Luna) { if (!s.ended) { s.ended = 'usuario'; log(s, 'Mission ended by the player.'); } }

// --- Objetivos ---

export interface LunaObjective { id: string; texto: string; ayuda: string; check: (s: Luna) => boolean }

export const LUNA_OBJECTIVES: LunaObjective[] = [
  {
    id: 'alunizar', texto: `Touch down below ${SAFE_VV} m/s`,
    ayuda: 'There is no air to brake or a parachute to open: only the engine can slow you down.',
    check: (s) => !!s.touchdown?.safe,
  },
  {
    id: 'sitio', texto: `Land within ${SITE_RADIUS / 1000} km of the site`,
    ayuda: 'Start braking when the distance to the site is close to the braking distance.',
    check: (s) => !!s.touchdown?.safe && s.touchdown.dist <= SITE_RADIUS,
  },
  {
    id: 'hielo', texto: `Extract ${ICE_GOAL} kg of water ice`,
    ayuda: 'The ice is in the permanently shadowed crater. Drilling uses a lot of power: do it in sunlight.',
    check: (s) => s.waterTotal >= ICE_GOAL,
  },
  {
    id: 'tormenta', texto: 'Ride out the solar storm in the shelter',
    ayuda: 'When the flare alert sounds, move the crew into the shelter before the protons arrive.',
    check: (s) => s.hours >= FLARE[1] && s.flareDose < 50,
  },
  {
    id: 'sobrevivir', texto: 'Keep the crew alive for 10 days',
    ayuda: 'Balance power, oxygen and heat: panels in sunlight, oxygen from ice, battery for the shadow.',
    check: (s) => s.ended === 'completada',
  },
];

/** Estado de cada objetivo; uno cumplido queda registrado. */
export function lunaObjectives(s: Luna): boolean[] {
  return LUNA_OBJECTIVES.map((o) => {
    const k = `obj:${o.id}`;
    if (!s.flags[k] && o.check(s)) s.flags[k] = true;
    return !!s.flags[k];
  });
}

/** Ficha de la misión para Inicio y Control de Misión. Se juega en su propia pantalla. */
export const LUNA: Mission = {
  id: 'luna',
  nombre: 'Ice in the shadows',
  nivel: 'Intermediate',
  resumen: 'Land on the Moon\'s south pole with only your engine to brake, then keep a crew of two alive for 10 days by turning crater ice into oxygen.',
  inspiracion: 'NASA Artemis and the LCROSS discovery of water ice (2009).',
  fuente: 'https://www.nasa.gov/humans-in-space/artemis/',
  presupuesto: null,
  preset: cloneDesign(PRESETS.pequeno),
  objetivos: LUNA_OBJECTIVES.map((o) => ({ id: o.id, texto: o.texto, ayuda: o.ayuda, check: () => false })),
};

export const LUNA_FUTURE = 'Coming in future versions: Mars, where a heat shield, parachutes and aerobraking do most of the braking; a crewed base that grows mission after mission; and rocket propellant made from lunar ice (ISRU) to fly home.';

const REF_LCROSS = {
  texto: 'In 2009 the LCROSS impactor hit the permanently shadowed crater Cabeus near the Moon\'s south pole and found water ice in the ejected plume, about 5.6 % of the regolith by mass. Artemis targets the south pole for that ice and for the crater rims that stay sunlit most of the time.',
  fuente: 'NASA Science · LCROSS',
  url: 'https://science.nasa.gov/mission/lcross/',
};
const REF_DV = {
  texto: 'The Moon has no atmosphere, so there is no drag, heat shield or parachute: the engine has to cancel all of the orbital speed. Low gravity (1.62 m/s², a sixth of Earth\'s) makes that braking much cheaper than landing on Earth with engines alone.',
  fuente: 'NASA · Moon Fact Sheet',
  url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
};

/** Informe de la misión, con el mismo formato que el de los vuelos terrestres. */
export function lunaReport(s: Luna): Report {
  const done = lunaObjectives(s);
  const objetivos = LUNA_OBJECTIVES.map((o, i) => ({ texto: o.texto, ok: done[i] }));
  const allDone = done.every(Boolean);
  const td = s.touchdown;
  const causas: string[] = [];
  const aciertos: string[] = [];
  const sugerencias: string[] = [];
  let titulo = 'Mission ended';
  let resultado: Report['resultado'] = 'parcial';
  let referencia = REF_DV;
  const days = s.hours / 24;

  if (!td) {
    titulo = 'Still in orbit';
    causas.push('The lander never reached the surface.');
    sugerencias.push('Point retrograde (Braking assist) and fire the engine about when the distance to the site equals the braking distance.');
  } else if (!td.safe) {
    titulo = 'Crash on the Moon';
    resultado = 'fallo';
    causas.push(`The lander hit the surface at ${n(td.vv, 1)} m/s downward and ${n(td.vh, 1)} m/s sideways, tilted ${n((td.tilt * 180) / Math.PI)}°. The legs take up to ${SAFE_VV} m/s down, ${SAFE_VH} m/s sideways and ${n((SAFE_TILT * 180) / Math.PI)}° of tilt.`);
    if (td.rough) {
      causas.push('The ground under the lander was a boulder field: a footpad on a rock tips the lander over even at a gentle speed.');
      sugerencias.push('Below 2 km the hazard scan paints clear ground green and boulders red. With the landing assist on, press ← or → to move the landing point to a green patch, as Neil Armstrong did on Apollo 11.');
    }
    if (td.prop <= 0) causas.push('The propellant ran out before touchdown: there was nothing left to brake with.');
    else causas.push(`You still had ${n(td.prop)} kg of propellant: the engine could have slowed you down.`);
    if (td.vh > SAFE_VH) sugerencias.push('Cancel the horizontal speed first, high up, then come down vertically.');
    sugerencias.push('Below 1 km, the landing assist or the Vertical mode keeps the legs under you. Aim for a descent rate of about a tenth of your altitude.');
  } else {
    titulo = 'Landed on the Moon';
    aciertos.push(`Touchdown at ${n(td.vv, 1)} m/s, ${td.dist < 1000 ? `${n(td.dist)} m` : `${n(td.dist / 1000, 1)} km`} from the site, with ${n(td.prop)} kg of propellant left.`);
    aciertos.push(`The descent cost ${n(s.dvUsed)} m/s of delta-v. Braking from a low Earth orbit would mean cancelling about 7,800 m/s; the Moon's low gravity makes its orbital speed much smaller.`);
    if (s.usedAssist) aciertos.push('You used the landing assist for the final meters, like the radar-guided descents of real landers.');
    if (s.redesignations > 0) aciertos.push(`You moved the landing point ${s.redesignations} time${s.redesignations === 1 ? '' : 's'} to avoid the boulders. Apollo 11 did the same: Armstrong flew past a boulder field and landed with about 25 seconds of propellant to spare.`);
    if (s.ended === 'completada') {
      titulo = allDone ? 'Mission accomplished' : 'The crew survived';
      aciertos.push(`The crew lived ${n(days)} days on the Moon. The battery never dropped below ${n(s.minBattery / 1000, 1)} kWh.`);
      referencia = REF_LCROSS;
    } else if (s.ended === 'energia') {
      resultado = 'fallo'; titulo = 'The base lost power';
      causas.push(`On day ${n(days, 1)} the battery was empty and the cabin cooled below ${COLD_LIMIT} °C.`);
      if (!s.panels) causas.push('The solar panels were never deployed: the battery alone lasts about a day.');
      else causas.push(`During the ${SHADOW[1] - SHADOW[0]} h without Sun, life support and heaters need ${n(((BASE_W + HEATER_W) * (SHADOW[1] - SHADOW[0])) / 1000)} kWh; the battery holds ${n(BATT_MAX / 1000)} kWh. Drilling or splitting water in the dark drains it much faster.`);
      sugerencias.push('Charge the battery fully before the shadow and stop the drill and the electrolyzer while the Sun is hidden. At the equator the lunar night lasts about 14 Earth days: that is why Artemis looks for the sunlit rims of the south pole.');
    } else if (s.ended === 'oxigeno') {
      resultado = 'fallo'; titulo = 'Out of oxygen';
      causas.push(`The oxygen ran out on day ${n(days, 1)}. Two people breathe about ${n(O2_USE * 24, 2)} kg per day and the lander carried ${O2_0} kg.`);
      sugerencias.push(`Drill for ice and run the electrolyzer: each kilogram of water gives ${n(O2_PER_WATER, 2)} kg of oxygen.`);
      referencia = REF_LCROSS;
    } else if (s.ended === 'radiacion') {
      resultado = 'fallo'; titulo = 'Radiation dose too high';
      causas.push(`The crew received ${n(s.dose)} mSv, over the ${DOSE_LIMIT} mSv limit. The storm alone added ${n(s.flareDose)} mSv.`);
      sugerencias.push('Move into the shelter as soon as the flare alert sounds. With no atmosphere or global magnetic field, the Moon offers no protection of its own.');
    } else {
      sugerencias.push(`The mission was ended on day ${n(days, 1)} of ${SURVIVE_H / 24}.`);
    }
    if (s.waterTotal > 0) aciertos.push(`The rover extracted ${n(s.waterTotal, 1)} kg of water: about ${n(s.waterTotal / ICE_FRACTION)} kg of regolith processed, which gave ${n(s.o2Made, 1)} kg of oxygen.`);
    if (s.hours >= FLARE[1]) {
      if (s.flareDose < 50) aciertos.push(`The shelter cut the storm dose to ${n(s.flareDose, 1)} mSv.`);
      else causas.push(`The storm added ${n(s.flareDose)} mSv to the crew's dose outside the shelter.`);
    }
  }
  if (allDone) resultado = 'exito';
  const i = done.indexOf(false);
  if (i >= 0 && resultado !== 'fallo') sugerencias.push(`Next objective: ${LUNA_OBJECTIVES[i].texto.toLowerCase()}. ${LUNA_OBJECTIVES[i].ayuda}`);
  sugerencias.push(LUNA_FUTURE);

  const cifras = [
    { k: 'Touchdown speed', v: td ? `${n(td.vv, 1)} m/s` : '—' },
    { k: 'Distance to site', v: td ? `${n(td.dist / 1000, 2)} km` : '—' },
    { k: 'Delta-v used', v: `${n(s.dvUsed)} m/s` },
    { k: 'Propellant left', v: `${n(s.prop)} kg` },
    { k: 'Descent time', v: `${n((td?.t ?? s.t) / 60, 1)} min` },
    { k: 'Days on the surface', v: n(days, 1) },
    { k: 'Water extracted', v: `${n(s.waterTotal, 1)} kg` },
    { k: 'Oxygen produced', v: `${n(s.o2Made, 1)} kg` },
    { k: 'Radiation dose', v: `${n(s.dose, 1)} mSv` },
  ];

  let puntaje = done.filter(Boolean).length * 100 + s.waterTotal * 5;
  if (td?.safe) puntaje += s.prop / 5 + Math.max(0, 200 - td.dist / 25);
  if (allDone) puntaje += 300;

  const resumen = allDone
    ? 'You landed on the Moon and kept the crew alive. These were the decisions that made it possible.'
    : resultado === 'fallo'
      ? 'The mission was not completed. This is what happened, according to the telemetry.'
      : 'You made progress, but some objectives are still open.';

  return {
    titulo, resultado, resumen, causas, aciertos, sugerencias, cifras,
    ciencia: { obtenida: 0, entregada: 0, mediciones: 0 },
    objetivos, referencia,
    puntaje: Math.round(puntaje),
    fecha: new Date().toISOString(),
    mision: LUNA.nombre,
    nave: 'Lunar lander',
  };
}

/** Etiquetas en inglés de los identificadores internos, para el texto que recibe Control de Misión. */
export const ASSIST_TEXT: Record<Assist, string> = { manual: 'manual', frenado: 'braking', vertical: 'vertical' };
export const LUNA_END_TEXT: Record<LunaEnd, string> = {
  choque: 'crashed on the surface', energia: 'the base lost power and the cabin froze', oxigeno: 'out of oxygen',
  radiacion: 'radiation dose over the limit', completada: 'completed, the crew survived 10 days', usuario: 'ended by the player',
};

/** Resumen en texto para Control de Misión. */
export function describeLuna(s: Luna): string {
  const done = lunaObjectives(s);
  const lines: string[] = [];
  if (s.phase === 'descenso') {
    const fr = localFrame(s);
    const p = predictPath(s);
    const b = brakingDistance(s);
    const miss = p.impact === null ? 0 : wrap(SITE_ANGLE - p.impact) * R_MOON;
    lines.push(
      `Lunar descent, T+${n(s.t)} s. Altitude ${n(fr.alt)} m, vertical speed ${n(fr.vv, 1)} m/s, horizontal speed ${n(fr.vh, 1)} m/s.`,
      `Distance to site ${n(siteDistance(s) / 1000, 1)} km, braking distance at full thrust ${isFinite(b) ? `${n(b / 1000, 1)} km` : s.prop > 0 ? 'unreachable: not enough propellant to stop' : 'none: no propellant left'}. ${p.impact === null ? 'Still in a stable orbit.' : `If the engine stays off, impact ${n(Math.abs(miss) / 1000, 1)} km ${miss >= 0 ? 'before' : 'past'} the site.`}`,
      fr.alt < ASSIST_ALT ? `Hazard scan: designated landing point ${n(Math.abs(targetDistance(s)))} m ${targetDistance(s) >= 0 ? 'ahead' : 'behind'}, ${rough(s.target) ? 'on boulders (redesignate with the arrow keys)' : 'on clear ground'}. Hover time left ${n(hoverTime(s))} s.` : `Hazard scan not available above ${ASSIST_ALT / 1000} km.`,
      `Throttle ${n(s.throttle * 100)} %, thrust angle ${n((s.pitch * 180) / Math.PI)}° from vertical, assist ${s.landingAssist ? 'landing assist' : ASSIST_TEXT[s.assist]}. Propellant ${n(s.prop)} kg, delta-v left ${n(dvLeft(s))} m/s.`,
    );
  } else {
    const pb = powerBalance(s);
    lines.push(
      `On the lunar surface, day ${n(s.hours / 24, 1)} of ${SURVIVE_H / 24}. ${sunlit(s.hours) ? 'Sunlit.' : 'In shadow.'}${flareActive(s.hours) ? ' Solar storm in progress.' : ''}`,
      `Battery ${n(s.battery / 1000, 1)} of ${BATT_MAX / 1000} kWh, generation ${n(pb.gen)} W, load ${n(pb.load)} W. Oxygen ${n(s.o2, 1)} kg (${n(o2Hours(s))} h). Water ${n(s.water, 1)} kg, extracted ${n(s.waterTotal, 1)} kg. Cabin ${n(s.temp)} °C. Dose ${n(s.dose, 1)} mSv.`,
      `Panels ${s.panels ? 'deployed' : 'stowed'}, drill ${s.drill ? 'on' : 'off'}, electrolyzer ${s.electro ? 'on' : 'off'}, crew ${s.shelter ? 'in the shelter' : 'in the cabin'}.`,
    );
  }
  if (s.ended) lines.push(`Mission ended: ${LUNA_END_TEXT[s.ended]}.`);
  lines.push(`Objectives: ${LUNA_OBJECTIVES.map((o, i) => `${done[i] ? '[done]' : '[pending]'} ${o.texto}`).join('; ')}.`);
  const ev = s.events.slice(-5).map((e) => e.text);
  if (ev.length) lines.push(`Latest events: ${ev.join(' | ')}`);
  return lines.join('\n');
}
