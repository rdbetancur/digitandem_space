// Atlas del sistema solar: posiciones aproximadas de los planetas y estimaciones de viaje.
// Datos y simplificaciones declarados en docs/FUENTES.md.

import { C_LIGHT, MU, RE } from './constants';

/** Unidad astronómica (m). */
export const AU = 1.495978707e11;
/** Parámetro gravitacional del Sol (m³/s²). */
export const MU_SUN = 1.32712440018e20;
/** Distancia media Tierra–Luna (m). */
export const MOON_DISTANCE = 384.4e6;
/** Periodo sidéreo de la Luna (días). */
const MOON_PERIOD = 27.321661;
/** Altura de la órbita baja de salida para las estimaciones de viaje (m). */
const LEO_ALT = 200e3;

export type BodyId = 'sol' | 'mercurio' | 'venus' | 'tierra' | 'luna' | 'marte' | 'jupiter' | 'saturno' | 'urano' | 'neptuno';

/**
 * Elementos keplerianos en J2000 y su variación por siglo (JPL, "Approximate Positions of
 * the Planets", tabla válida de 1800 a 2050). Se usan a, e, longitud media L y longitud del
 * perihelio w; la inclinación se ignora porque el Atlas es un mapa plano de la eclíptica.
 */
interface Elements { a: number; e: number; L: number; Ldot: number; w: number; wdot: number }

export interface Body {
  id: BodyId;
  nombre: string;
  tipo: string;
  color: string;
  /** Radio medio (km). */
  radio: number;
  /** Gravedad en la superficie o en el nivel de 1 bar (m/s²). */
  gravedad: number;
  /** Temperatura media (°C). */
  temperatura: number;
  atmosfera: string;
  interes: string;
  mision: string;
  el?: Elements;
}

export const BODIES: Body[] = [
  {
    id: 'sol', nombre: 'Sol', tipo: 'Estrella', color: '#ffd35a', radio: 695700, gravedad: 274, temperatura: 5500,
    atmosfera: 'Plasma de hidrógeno y helio.',
    interes: 'Su luz alimenta los paneles solares y su actividad produce tormentas que afectan a las naves.',
    mision: 'Parker Solar Probe atraviesa la corona solar desde 2021.',
  },
  {
    id: 'mercurio', nombre: 'Mercurio', tipo: 'Planeta rocoso', color: '#b9a48c', radio: 2439.7, gravedad: 3.7, temperatura: 167,
    atmosfera: 'Casi inexistente.',
    interes: 'Tan cerca del Sol que llegar exige frenar mucho. Aun así guarda hielo en cráteres polares siempre en sombra.',
    mision: 'MESSENGER lo orbitó entre 2011 y 2015.',
    el: { a: 0.38709927, e: 0.20563593, L: 252.2503235, Ldot: 149472.67411175, w: 77.45779628, wdot: 0.16047689 },
  },
  {
    id: 'venus', nombre: 'Venus', tipo: 'Planeta rocoso', color: '#e8c98a', radio: 6051.8, gravedad: 8.87, temperatura: 464,
    atmosfera: 'Dióxido de carbono, 92 veces la presión de la Tierra.',
    interes: 'Un efecto invernadero extremo: su superficie es más caliente que la de Mercurio.',
    mision: 'Magellan cartografió su superficie con radar entre 1990 y 1994.',
    el: { a: 0.72333566, e: 0.00677672, L: 181.9790995, Ldot: 58517.81538729, w: 131.60246718, wdot: 0.00268329 },
  },
  {
    id: 'tierra', nombre: 'Tierra', tipo: 'Planeta rocoso', color: '#5aa2f0', radio: 6371, gravedad: 9.8, temperatura: 15,
    atmosfera: 'Nitrógeno y oxígeno, 1 bar.',
    interes: 'El punto de partida. Observarla desde la órbita permite seguir incendios, huracanes y cosechas.',
    mision: 'Los satélites Landsat la fotografían sin pausa desde 1972.',
    el: { a: 1.00000261, e: 0.01671123, L: 100.46457166, Ldot: 35999.37244981, w: 102.93768193, wdot: 0.32327364 },
  },
  {
    id: 'luna', nombre: 'Luna', tipo: 'Satélite de la Tierra', color: '#cfd3da', radio: 1737.4, gravedad: 1.62, temperatura: -20,
    atmosfera: 'Sin atmósfera.',
    interes: 'A tres días de viaje. En los cráteres en sombra de su polo sur hay hielo de agua.',
    mision: 'LCROSS confirmó ese hielo en 2009; el programa Artemis vuelve a llevar tripulación.',
  },
  {
    id: 'marte', nombre: 'Marte', tipo: 'Planeta rocoso', color: '#e0703c', radio: 3389.5, gravedad: 3.71, temperatura: -65,
    atmosfera: 'Dióxido de carbono, 0,6 % de la presión de la Tierra.',
    interes: 'Tuvo ríos y lagos. Su aire es tan tenue que frenar para aterrizar es el paso más difícil.',
    mision: 'Perseverance aterrizó en el cráter Jezero en 2021 y llevó el helicóptero Ingenuity.',
    el: { a: 1.52371034, e: 0.0933941, L: -4.55343205, Ldot: 19140.30268499, w: -23.94362959, wdot: 0.44441088 },
  },
  {
    id: 'jupiter', nombre: 'Júpiter', tipo: 'Gigante gaseoso', color: '#d9b38c', radio: 69911, gravedad: 23.1, temperatura: -110,
    atmosfera: 'Hidrógeno y helio, sin superficie sólida.',
    interes: 'El planeta más grande. Su luna Europa esconde un océano bajo el hielo.',
    mision: 'Juno lo orbita desde 2016; Europa Clipper despegó en 2024.',
    el: { a: 5.202887, e: 0.04838624, L: 34.39644051, Ldot: 3034.74612775, w: 14.72847983, wdot: 0.21252668 },
  },
  {
    id: 'saturno', nombre: 'Saturno', tipo: 'Gigante gaseoso', color: '#e6d3a1', radio: 58232, gravedad: 9, temperatura: -140,
    atmosfera: 'Hidrógeno y helio, sin superficie sólida.',
    interes: 'Sus anillos son hielo y roca. Su luna Titán tiene atmósfera densa y lagos de metano.',
    mision: 'Cassini lo estudió de 2004 a 2017.',
    el: { a: 9.53667594, e: 0.05386179, L: 49.95424423, Ldot: 1222.49362201, w: 92.59887831, wdot: -0.41897216 },
  },
  {
    id: 'urano', nombre: 'Urano', tipo: 'Gigante de hielo', color: '#9fd8e0', radio: 25362, gravedad: 8.7, temperatura: -195,
    atmosfera: 'Hidrógeno, helio y metano.',
    interes: 'Gira acostado, con el eje casi sobre el plano de su órbita.',
    mision: 'Solo lo ha visitado Voyager 2, en 1986.',
    el: { a: 19.18916464, e: 0.04725744, L: 313.23810451, Ldot: 428.48202785, w: 170.9542763, wdot: 0.40805281 },
  },
  {
    id: 'neptuno', nombre: 'Neptuno', tipo: 'Gigante de hielo', color: '#5b7fe8', radio: 24622, gravedad: 11, temperatura: -200,
    atmosfera: 'Hidrógeno, helio y metano.',
    interes: 'El más lejano: la luz del Sol llega unas 900 veces más débil que a la Tierra.',
    mision: 'Solo lo ha visitado Voyager 2, en 1989.',
    el: { a: 30.06992276, e: 0.00859048, L: -55.12002969, Ldot: 218.45945325, w: 44.96476227, wdot: -0.32241464 },
  },
];

export const BODY: Record<BodyId, Body> = Object.fromEntries(BODIES.map((b) => [b.id, b])) as Record<BodyId, Body>;

export interface P2 { x: number; y: number }

const DEG = Math.PI / 180;
const DAY = 86400e3;
/** Milisegundos Unix de la época J2000 (1 de enero de 2000, 12:00 TT, tomado como UTC). */
const J2000 = Date.UTC(2000, 0, 1, 12);

function kepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Punto de la órbita de un planeta para la anomalía excéntrica E, en UA. */
export function orbitPoint(el: Elements, E: number, date: number): P2 {
  const T = (date - J2000) / DAY / 36525;
  const w = (el.w + el.wdot * T) * DEG;
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return { x: xp * Math.cos(w) - yp * Math.sin(w), y: xp * Math.sin(w) + yp * Math.cos(w) };
}

/** Posición heliocéntrica en el plano de la eclíptica (UA) para una fecha en ms Unix. */
export function position(id: BodyId, date: number): P2 {
  if (id === 'sol') return { x: 0, y: 0 };
  if (id === 'luna') {
    // Órbita circular alrededor de la Tierra. Fase de referencia: luna nueva del 6 de enero de 2000.
    const e = position('tierra', date);
    const sun = Math.atan2(-e.y, -e.x);
    const a = sun + (2 * Math.PI * (date - Date.UTC(2000, 0, 6, 18, 14))) / (29.530589 * DAY);
    const d = MOON_DISTANCE / AU;
    return { x: e.x + d * Math.cos(a), y: e.y + d * Math.sin(a) };
  }
  const el = BODY[id].el!;
  const T = (date - J2000) / DAY / 36525;
  const M = ((el.L + el.Ldot * T) - (el.w + el.wdot * T)) * DEG;
  return orbitPoint(el, kepler(M, el.e), date);
}

export function distance(a: BodyId, b: BodyId, date: number): number {
  const p = position(a, date), q = position(b, date);
  return Math.hypot(p.x - q.x, p.y - q.y) * AU;
}

/** Segundos que tarda la luz (o una orden por radio) en recorrer una distancia en metros. */
export function lightTime(meters: number): number {
  return meters / C_LIGHT;
}

/** Potencia de un panel solar respecto a la que da junto a la Tierra (1 = igual). */
export function solarFactor(id: BodyId, date: number): number {
  if (id === 'sol') return Infinity;
  const p = position(id, date);
  const r = Math.hypot(p.x, p.y);
  return 1 / (r * r);
}

export interface Trip {
  /** Impulso para salir de una órbita baja terrestre hacia el destino (m/s). */
  dv: number;
  /** Duración del viaje (s). */
  time: number;
  /** Próxima fecha favorable de salida (ms Unix), o null si se puede salir cualquier día. */
  window: number | null;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Viaje de mínima energía (transferencia de Hohmann) desde una órbita baja terrestre.
 * Supone órbitas circulares y coplanares; no incluye frenar ni aterrizar en el destino.
 */
export function trip(id: BodyId, from: number): Trip | null {
  if (id === 'sol' || id === 'tierra') return null;
  const rLeo = RE + LEO_ALT;
  const vLeo = Math.sqrt(MU / rLeo);
  if (id === 'luna') {
    const a = (rLeo + MOON_DISTANCE) / 2;
    return {
      dv: Math.sqrt(MU * (2 / rLeo - 1 / a)) - vLeo,
      time: Math.PI * Math.sqrt((a * a * a) / MU),
      window: null,
    };
  }
  const r1 = AU, r2 = BODY[id].el!.a * AU;
  const vInf = Math.abs(Math.sqrt(MU_SUN / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1));
  const at = (r1 + r2) / 2;
  const time = Math.PI * Math.sqrt((at * at * at) / MU_SUN);
  // Al salir, el destino debe ir por delante el ángulo justo para que nave y planeta lleguen juntos.
  const phase = Math.PI - Math.sqrt(MU_SUN / (r2 * r2 * r2)) * time;
  const err = (date: number) => {
    const e = position('tierra', date), p = position(id, date);
    return wrap(Math.atan2(p.y, p.x) - Math.atan2(e.y, e.x) - phase);
  };
  let window: number | null = null;
  let prev = err(from);
  for (let d = 1; d <= 900; d++) {
    const cur = err(from + d * DAY);
    if (Math.abs(cur) < 0.2 && Math.abs(prev) < 0.2 && Math.sign(cur) !== Math.sign(prev)) { window = from + d * DAY; break; }
    prev = cur;
  }
  return { dv: Math.sqrt(vInf * vInf + (2 * MU) / rLeo) - vLeo, time, window };
}

export { MOON_PERIOD };
