// Planificador del Atlas: la trayectoria de un viaje y qué le pasa a tu nave en el destino.
// Simplificaciones declaradas en docs/FUENTES.md.

import { AU, BodyId, P2, distance, lightTime, position, solarFactor, trip } from './atlas';

export interface Journey {
  id: BodyId;
  /** Salida y llegada (ms Unix). */
  depart: number;
  arrive: number;
}

/** Viaje que sale en la próxima ventana (o ahora mismo, si el destino es la Luna). */
export function planJourney(id: BodyId, from: number): Journey | null {
  const t = trip(id, from);
  if (!t) return null;
  const depart = t.window ?? (id === 'luna' ? from : null);
  if (depart === null) return null;
  return { id, depart, arrive: depart + t.time * 1000 };
}

function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 10; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/**
 * Posición de la nave (UA, heliocéntrica) cuando ha pasado la fracción f del viaje.
 * Recorre media elipse de transferencia entre el punto de salida de la Tierra y el punto
 * donde estará el destino al llegar. La nave va más rápido cerca del Sol (ley de Kepler).
 */
export function journeyPoint(j: Journey, f: number): P2 {
  const k = Math.max(0, Math.min(1, f));
  const a0 = position('tierra', j.depart), a1 = position(j.id, j.arrive);
  if (j.id === 'luna') return { x: a0.x + (a1.x - a0.x) * k, y: a0.y + (a1.y - a0.y) * k };
  const r0 = Math.hypot(a0.x, a0.y), r1 = Math.hypot(a1.x, a1.y);
  const th0 = Math.atan2(a0.y, a0.x);
  let sweep = Math.atan2(a1.y, a1.x) - th0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const a = (r0 + r1) / 2, e = Math.abs(r1 - r0) / (r0 + r1);
  const outward = r1 >= r0;
  // Hacia afuera la Tierra es el perihelio de la elipse; hacia adentro, el afelio.
  const M = outward ? Math.PI * k : Math.PI + Math.PI * k;
  const E = solveKepler(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const turned = outward ? nu : nu < 0 ? nu + Math.PI : nu - Math.PI;
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
  const th = th0 + (Math.max(0, Math.min(Math.PI, turned)) / Math.PI) * sweep;
  return { x: r * Math.cos(th), y: r * Math.sin(th) };
}

/** Tasa de datos de referencia: una antena de alta ganancia a 1 UA entrega unos 8 kbit/s. */
const HIGH_GAIN_LEO = 1.2; // MB/s en órbita baja, del catálogo
const KBPS_AT_1AU = 8;
/** Tamaño de una foto de la cámara del juego (MB). */
const PHOTO_MB = 40;

export interface Outlook {
  /** Potencia solar en el destino y consumo base de la nave (W). */
  solarW: number;
  baseW: number;
  /** Paneles extra (30 W junto a la Tierra) que harían falta para cubrir el consumo; 0 si alcanza. */
  panelsShort: number;
  /** Tasa de datos hacia la Tierra (kbit/s); 0 si la nave no lleva antena. */
  kbps: number;
  /** Segundos para enviar una foto de 40 MB, o Infinity sin antena. */
  photoTime: number;
  /** Retraso de una orden, ida (s). */
  delay: number;
}

/**
 * Cómo le iría a una nave en el destino, en esa fecha.
 * solarAtEarthW: generación solar junto a la Tierra; rateLeo: tasa de su antena en órbita baja (MB/s).
 */
export function outlook(id: BodyId, date: number, craft: { solarAtEarthW: number; baseW: number; rateLeo: number }): Outlook {
  const factor = id === 'sol' ? 1 : solarFactor(id, date);
  const solarW = craft.solarAtEarthW * factor;
  const d = id === 'tierra' ? 0 : distance('tierra', id, date);
  const dAu = Math.max(d / AU, 0.0026);
  // La señal se reparte sobre una esfera cada vez más grande: la tasa cae con el cuadrado de la distancia.
  const kbps = craft.rateLeo > 0 ? (KBPS_AT_1AU * (craft.rateLeo / HIGH_GAIN_LEO)) / (dAu * dAu) : 0;
  const short = craft.baseW - solarW;
  return {
    solarW,
    baseW: craft.baseW,
    panelsShort: short > 0 ? Math.ceil(short / (30 * factor)) : 0,
    kbps,
    photoTime: kbps > 0 ? (PHOTO_MB * 8000) / kbps : Infinity,
    delay: lightTime(d),
  };
}
