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

const n = (x: number, d = 0) => x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });

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
  if (!targetInView(f.r, f.t)) return { ok: false, texto: 'el incendio no estaba en el campo de visión' };
  if (!isSunlit(targetPos(f.t))) return { ok: false, texto: 'en la zona del incendio era de noche' };
  if (res > GSD_MAX) return { ok: false, texto: `desde ${n(m.alt / 1000)} km cada píxel cubre ${n(res)} m y se necesitan ${GSD_MAX} m o menos` };
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
      m.reading = `Imagen del incendio desde ${n(m.alt / 1000)} km: ${n(res)} m por píxel.`;
      f.events.push({ t: f.t, text: `Imagen útil del incendio: ${n(res)} m por píxel.`, kind: 'ok' });
    } else {
      m.reading = `Imagen de la Tierra desde ${n(m.alt / 1000)} km. No sirve para la misión: ${j.texto}.`;
      f.events.push({ t: f.t, text: `La imagen no sirve para la misión: ${j.texto}.`, kind: 'warn' });
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
    if (err) f.events.push({ t: f.t, text: `La captura programada falló: ${err}`, kind: 'warn' });
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
    { k: 'Incendio', v: view ? 'en el campo de visión' : next !== null ? `sobrevuelo en ${clock(next)}` : 'fuera de vista', tone: view ? 'ok' as const : undefined },
    { k: 'Luz en la zona', v: day ? 'de día' : 'de noche', tone: day ? undefined : 'bad' as const },
    { k: 'Detalle desde aquí', v: `${n(res)} m por píxel`, tone: f.landed ? undefined : res <= GSD_MAX ? 'ok' as const : 'bad' as const },
    { k: 'Pasadas útiles', v: `${p.total} de ${PASSES_NEEDED} · ${p.entregadas} en Tierra` },
  ];
}

const preset = cloneDesign(PRESETS.pequeno);
preset.nombre = 'Observador terrestre';
preset.instruments = ['camara'];

const inOrbit = (f: Flight) => {
  if (f.landed) return false;
  const o = orbitOf(f.r, f.v);
  return o.e < 1 && o.pe - RE > ATM_TOP + 10e3;
};

export const OJO: Mission = {
  id: 'ojo',
  nombre: 'Ojo en la Tierra',
  nivel: 'Inicial',
  resumen: 'Sigue un incendio forestal desde la órbita: elige la altura, fotografíalo en tres pasadas y baja las imágenes a Tierra.',
  inspiracion: 'Satélites Landsat y Terra, y el rastreador de eventos naturales EONET de la NASA.',
  fuente: 'https://eonet.gsfc.nasa.gov/',
  presupuesto: 10,
  preset,
  requisitos: [
    'La nave debe llevar una cámara. Su detalle es de 6 m por píxel por cada 100 km de altura.',
    `Una imagen sirve con ${GSD_MAX} m por píxel o menos: la órbita debe quedar por debajo de 500 km.`,
    'Más bajo da más detalle y más ciencia, pero las pasadas sobre las estaciones duran menos y cuesta más bajar los datos.',
    'Son tres imágenes de 40 MB: revisa el almacenamiento y la antena que eliges.',
    'El incendio solo se ve de día. Al despegar quedan unas 10 horas de luz en la zona.',
  ],
  referencia: {
    texto: 'Los satélites Landsat observan la Tierra desde 1972. Landsat 8 y 9 toman imágenes de 30 m por píxel desde 705 km de altura. La órbita de un satélite de observación se elige según el detalle y la cobertura que necesita la ciencia.',
    fuente: 'NASA · Landsat Science',
    url: 'https://landsat.gsfc.nasa.gov/',
  },
  target: { nombre: 'Incendio forestal', pos: targetPos },
  onStep,
  panel,
  accion: {
    texto: (f) => (f.flags[ARMED] ? 'Captura programada · cancelar' : 'Programar captura en el próximo sobrevuelo'),
    run: (f) => {
      if (!f.design.instruments.includes('camara')) return 'La nave no lleva cámara.';
      f.flags[ARMED] = !f.flags[ARMED];
      return f.flags[ARMED] ? 'La cámara disparará sola cuando el incendio esté a la vista y sea de día.' : null;
    },
  },
  objetivos: [
    {
      id: 'orbita', texto: 'Órbita estable: periapsis sobre 150 km',
      ayuda: 'Necesitas unos 7,8 km/s de velocidad horizontal para no volver a caer.',
      check: inOrbit,
    },
    {
      id: 'operativo', texto: 'Satélite liberado y desplegado',
      ayuda: 'Separa la última etapa con la barra espaciadora y despliega paneles y antena con G.',
      check: (f) => payloadOnly(f) && f.deployed,
    },
    {
      id: 'imagen', texto: `Toma una imagen útil del incendio (${GSD_MAX} m por píxel o menos, de día)`,
      ayuda: 'Programa la captura o usa la cámara justo cuando el incendio esté en el campo de visión.',
      check: (f) => passes(f).total >= 1,
    },
    {
      id: 'seguimiento', texto: `Síguelo en ${PASSES_NEEDED} pasadas distintas`,
      ayuda: 'Un fenómeno cambia: hace falta volver a verlo. Cada vuelta a la Tierra da una pasada nueva.',
      check: (f) => passes(f).total >= PASSES_NEEDED,
    },
    {
      id: 'entrega', texto: `Entrega en Tierra una imagen de cada pasada`,
      ayuda: 'Las imágenes pesan 40 MB. Con una antena lenta harán falta varias pasadas sobre las estaciones.',
      check: (f) => passes(f).entregadas >= PASSES_NEEDED,
    },
  ],
};
