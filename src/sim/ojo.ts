// Misión "Ojo en la Tierra": observar un incendio forestal desde la órbita.
// La altura de la órbita decide el detalle de las imágenes y el tiempo de enlace.
// Toda la lógica vive aquí; el vuelo solo llama a onStep después de cada paso.

import { ATM_TOP, OMEGA, RE, SITE_ANGLE0 } from './constants';
import { Flight, Measurement, Vec, isSunlit, measure, orbitOf, payloadOnly } from './flight';
import type { Mission } from './missions';
import { PRESETS, cloneDesign } from './vehicle';

/** El incendio está 30° al oeste de la plataforma: la nave lo sobrevuela al cerrar la primera vuelta. */
const TARGET_OFFSET = Math.PI / 6;
/** Resolución de la cámara: metros por píxel por cada kilómetro de altura. Simplificación. */
export const GSD_PER_KM = 0.06;
/** Detalle mínimo útil, el de las imágenes Landsat (m por píxel). */
export const GSD_MAX = 30;
/** La cámara puede apuntar hasta este ángulo fuera de la vertical (rad). */
const OFF_NADIR_MAX = (30 * Math.PI) / 180;
/** Dos imágenes separadas por menos de esto pertenecen a la misma pasada (s). */
const PASS_GAP = 1800;
export const PASSES_NEEDED = 3;

const ARMED = 'ojo:armada';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function targetAngle(t: number): number {
  return SITE_ANGLE0 + TARGET_OFFSET - OMEGA * t;
}

export function targetPos(t: number): Vec {
  const a = targetAngle(t);
  return { x: RE * Math.cos(a), y: RE * Math.sin(a) };
}

/** Metros por píxel de una imagen tomada desde esta altura. */
export function gsd(alt: number): number {
  return (Math.max(alt, 0) / 1000) * GSD_PER_KM;
}

/** ¿Puede la cámara apuntar al incendio desde la posición r en el instante t? */
export function targetInView(r: Vec, t: number): boolean {
  const rm = Math.hypot(r.x, r.y);
  const lambda = Math.abs(wrap(Math.atan2(r.y, r.x) - targetAngle(t)));
  if (Math.cos(lambda) <= RE / rm) return false; // bajo el horizonte
  const offNadir = Math.atan2(RE * Math.sin(lambda), rm - RE * Math.cos(lambda));
  return offNadir <= OFF_NADIR_MAX;
}

/** Segundos hasta el próximo sobrevuelo del incendio, o null si la nave no está en órbita. */
export function timeToTarget(f: Flight): number | null {
  if (f.landed) return null;
  const rm = Math.hypot(f.r.x, f.r.y);
  const o = orbitOf(f.r, f.v);
  if (!(o.e < 1) || o.pe - RE < ATM_TOP) return null;
  // La nave y el suelo giran en el mismo sentido; cuenta la diferencia de velocidades angulares.
  const rate = Math.abs(f.r.x * f.v.y - f.r.y * f.v.x) / (rm * rm) - OMEGA;
  if (rate <= 0) return null;
  let gap = Math.atan2(f.r.y, f.r.x) - targetAngle(f.t);
  while (gap < 0) gap += 2 * Math.PI;
  while (gap >= 2 * Math.PI) gap -= 2 * Math.PI;
  return gap / rate;
}

function judge(f: Flight, m: Measurement): { ok: boolean; texto: string } {
  const res = gsd(m.alt);
  if (!targetInView(f.r, f.t)) return { ok: false, texto: 'the fire was not in the field of view' };
  if (!isSunlit(targetPos(f.t))) return { ok: false, texto: 'it was night over the fire' };
  if (res > GSD_MAX) return { ok: false, texto: `from ${n(m.alt / 1000)} km each pixel covers ${n(res)} m and ${GSD_MAX} m or less is needed` };
  return { ok: true, texto: '' };
}

/** Revisa las imágenes nuevas y decide si sirven para la misión. */
function review(f: Flight) {
  for (const m of f.measurements) {
    if (m.instrument !== 'camara' || f.flags[`ojo:vista:${m.id}`]) continue;
    f.flags[`ojo:vista:${m.id}`] = true;
    const j = judge(f, m);
    if (j.ok) {
      const res = gsd(m.alt);
      f.flags[`ojo:util:${m.id}`] = true;
      // Más detalle, más valor científico: una órbita baja rinde hasta 2,5 veces más.
      m.points *= Math.min(2.5, GSD_MAX / res);
      m.reading = `Image of the fire from ${n(m.alt / 1000)} km: ${n(res)} m per pixel.`;
      f.events.push({ t: f.t, text: `Usable image of the fire: ${n(res)} m per pixel.`, kind: 'ok' });
    } else {
      m.reading = `Image of Earth from ${n(m.alt / 1000)} km. Not usable for the mission: ${j.texto}.`;
      f.events.push({ t: f.t, text: `The image is not usable for the mission: ${j.texto}.`, kind: 'warn' });
    }
  }
}

/** Pasadas con al menos una imagen útil, y cuántas de ellas ya llegaron a Tierra. */
export function passes(f: Flight): { total: number; entregadas: number } {
  const good = f.measurements.filter((m) => f.flags[`ojo:util:${m.id}`]).sort((a, b) => a.t - b.t);
  let total = 0, entregadas = 0, start = -Infinity, delivered = false;
  for (const m of good) {
    if (m.t - start >= PASS_GAP) {
      if (total > 0 && delivered) entregadas += 1;
      total += 1; start = m.t; delivered = false;
    }
    if (m.sent >= m.mb) delivered = true;
  }
  if (total > 0 && delivered) entregadas += 1;
  return { total, entregadas };
}

function onStep(f: Flight) {
  if (f.flags[ARMED] && !f.landed && targetInView(f.r, f.t) && isSunlit(targetPos(f.t))) {
    f.flags[ARMED] = false;
    const err = measure(f, 'camara');
    if (err) f.events.push({ t: f.t, text: `The scheduled capture failed: ${err}`, kind: 'warn' });
  }
  review(f);
}

const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
};

function panel(f: Flight) {
  const alt = Math.hypot(f.r.x, f.r.y) - RE;
  const res = gsd(alt);
  const view = !f.landed && targetInView(f.r, f.t);
  const day = isSunlit(targetPos(f.t));
  const next = timeToTarget(f);
  const p = passes(f);
  return [
    { k: 'Fire', v: view ? 'in the field of view' : next !== null ? `overpass in ${clock(next)}` : 'out of view', tone: view ? 'ok' as const : undefined },
    { k: 'Light over the area', v: day ? 'daytime' : 'night', tone: day ? undefined : 'bad' as const },
    { k: 'Detail from here', v: `${n(res)} m per pixel`, tone: f.landed ? undefined : res <= GSD_MAX ? 'ok' as const : 'bad' as const },
    { k: 'Usable passes', v: `${p.total} of ${PASSES_NEEDED} · ${p.entregadas} on Earth` },
  ];
}

const preset = cloneDesign(PRESETS.pequeno);
preset.nombre = 'Earth observer';
preset.instruments = ['camara'];

const inOrbit = (f: Flight) => {
  if (f.landed) return false;
  const o = orbitOf(f.r, f.v);
  return o.e < 1 && o.pe - RE > ATM_TOP + 10e3;
};

export const OJO: Mission = {
  id: 'ojo',
  nombre: 'Eye on Earth',
  nivel: 'Beginner',
  resumen: 'Track a wildfire from orbit: choose your altitude, photograph it on three passes and downlink the images to Earth.',
  inspiracion: 'The Landsat and Terra satellites, and NASA\'s EONET natural event tracker.',
  fuente: 'https://eonet.gsfc.nasa.gov/',
  presupuesto: 10,
  preset,
  requisitos: [
    'The craft must carry a camera. Its detail is 6 m per pixel for every 100 km of altitude.',
    `An image is usable at ${GSD_MAX} m per pixel or less: the orbit must stay below 500 km.`,
    'Lower gives more detail and more science, but passes over the stations are shorter and downlinking the data is harder.',
    'That is three 40 MB images: check your storage and the antenna you choose.',
    'The fire is only visible in daylight. At liftoff there are about 10 hours of daylight left over the area.',
  ],
  referencia: {
    texto: 'The Landsat satellites have observed Earth since 1972. Landsat 8 and 9 take images at 30 m per pixel from 705 km up. An observation satellite\'s orbit is chosen for the detail and coverage the science needs.',
    fuente: 'NASA · Landsat Science',
    url: 'https://landsat.gsfc.nasa.gov/',
  },
  target: { nombre: 'Wildfire', pos: targetPos },
  onStep,
  panel,
  capturas: (f) => f.measurements.filter((m) => f.flags[`ojo:util:${m.id}`]).map((m) => ({ id: m.id, gsd: gsd(m.alt) })),
  accion: {
    texto: (f) => (f.flags[ARMED] ? 'Capture scheduled · cancel' : 'Schedule a capture on the next overpass'),
    run: (f) => {
      if (!f.design.instruments.includes('camara')) return 'The craft has no camera.';
      f.flags[ARMED] = !f.flags[ARMED];
      return f.flags[ARMED] ? 'The camera will fire on its own when the fire is in view and it is daytime.' : null;
    },
  },
  objetivos: [
    {
      id: 'orbita', texto: 'Stable orbit: periapsis above 150 km',
      ayuda: 'You need about 7.8 km/s of horizontal speed to stop falling back.',
      check: inOrbit,
    },
    {
      id: 'operativo', texto: 'Satellite released and deployed',
      ayuda: 'Separate the last stage with the space bar and deploy panels and antenna with G.',
      check: (f) => payloadOnly(f) && f.deployed,
    },
    {
      id: 'imagen', texto: `Take a usable image of the fire (${GSD_MAX} m per pixel or less, in daylight)`,
      ayuda: 'Schedule the capture, or use the camera just as the fire enters the field of view.',
      check: (f) => passes(f).total >= 1,
    },
    {
      id: 'seguimiento', texto: `Track it on ${PASSES_NEEDED} separate passes`,
      ayuda: 'Events change, so you have to look again. Each trip around Earth gives a new pass.',
      check: (f) => passes(f).total >= PASSES_NEEDED,
    },
    {
      id: 'entrega', texto: `Deliver one image from each pass to Earth`,
      ayuda: 'Each image is 40 MB. With a slow antenna it will take several passes over the stations.',
      check: (f) => passes(f).entregadas >= PASSES_NEEDED,
    },
  ],
};
